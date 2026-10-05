import { chromium } from 'playwright';

async function inspectLive() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts()[0]?.pages() || [];
  
  if (pages.length === 0) {
    console.log('No pages found in browser context.');
    await browser.close();
    return;
  }

  // Find the railway tab
  const page = pages.find(p => p.url().includes('railway.gov.bd')) || pages[0];
  console.log('='.repeat(70));
  console.log(`📍 LIVE TAB SNAPSHOT`);
  console.log(`URL:   ${page.url()}`);
  console.log(`Title: ${await page.title()}`);
  console.log('='.repeat(70));

  const pageData = await page.evaluate(() => {
    // 1. Current Step Detection
    const url = window.location.href;
    let step = 'HOME / SEARCH';
    if (url.includes('/booking/train/search')) {
      step = 'TRAIN_RESULTS';
    }

    // 2. Train Cards
    const trainCards = Array.from(document.querySelectorAll('.single-trip-wrapper, .trip-wrapper, .train-name')).map(t => {
      const parent = t.closest('.single-trip-wrapper, .trip-wrapper') || t;
      return {
        text: (t.textContent || '').trim().replace(/\s+/g, ' '),
        classes: Array.from(parent.querySelectorAll('button, .seat-class-type, .class-name, .btn')).map(c => c.textContent?.trim()).filter(Boolean),
      };
    });

    // 3. Seat Map Inspection
    const coachSelect = document.querySelector('select[name="coach"], select.coach-select, .coach-selection');
    const coachName = document.querySelector('.selected-coach, .coach-name, .active-coach')?.textContent?.trim() || '';
    
    const seatNodes = Array.from(document.querySelectorAll('.seat, .single-seat, [data-seat], svg rect, svg g, .seat-item')).map(s => {
      return {
        tag: s.tagName.toLowerCase(),
        classes: Array.from(s.classList),
        id: s.id,
        dataSeat: s.getAttribute('data-seat'),
        dataCoach: s.getAttribute('data-coach'),
        text: s.textContent?.trim() || '',
        ariaLabel: s.getAttribute('aria-label'),
        disabled: s.hasAttribute('disabled') || s.getAttribute('aria-disabled') === 'true',
        selected: s.classList.contains('selected') || s.getAttribute('aria-selected') === 'true',
        booked: s.classList.contains('booked') || s.classList.contains('occupied') || s.classList.contains('seat-booked'),
      };
    }).filter(s => s.dataSeat || s.text || s.id || s.classes.some(c => c.includes('seat')));

    // 4. Passenger Form Inputs
    const passengerInputs = Array.from(document.querySelectorAll('input, select, textarea')).map(el => {
      const input = el as HTMLInputElement;
      return {
        tag: input.tagName.toLowerCase(),
        type: input.type,
        name: input.name,
        id: input.id,
        placeholder: input.placeholder,
        value: input.value ? (input.name.includes('pass') ? '***' : input.value) : '',
      };
    }).filter(i => i.name || i.placeholder || i.id);

    // 5. Booking Summary / Seat Details
    const seatDetails = Array.from(document.querySelectorAll('.seat-details, .fare-details, .selected-seats-list, .trip-fare-details')).map(el => {
      return (el.textContent || '').trim().replace(/\s+/g, ' ');
    });

    // 6. Action Buttons
    const buttons = Array.from(document.querySelectorAll('button, a.btn, input[type="submit"]')).map(b => {
      const btn = b as HTMLElement;
      return {
        text: (btn.innerText || btn.getAttribute('value') || '').trim(),
        className: btn.className,
        id: btn.id,
      };
    }).filter(b => b.text && b.text.length < 50);

    // 7. OTP Detection
    const bodyText = document.body.innerText;
    const isOtpScreen = /enter otp|one time password|verification code|verify otp|otp sent/i.test(bodyText);
    const otpInput = document.querySelector('input[name*="otp"], input[placeholder*="OTP"], input[id*="otp"]');

    return {
      step,
      trainCards: trainCards.slice(0, 10),
      coachName,
      totalSeatNodes: seatNodes.length,
      sampleSeats: seatNodes.slice(0, 10),
      passengerInputs,
      seatDetails,
      buttons,
      isOtpScreen,
      otpInput: otpInput ? { id: otpInput.id, name: (otpInput as HTMLInputElement).name } : null,
    };
  });

  // Verification against our code's expectations
  console.log(`\n📋 CURRENT STAGE: ${pageData.step}`);
  
  if (pageData.trainCards.length > 0) {
    console.log(`\n🚂 Train Cards Detected (${pageData.trainCards.length}):`);
    pageData.trainCards.forEach(t => console.log(`   - ${t.text.slice(0, 60)} | Classes: ${t.classes.slice(0, 5).join(', ')}`));
  }

  if (pageData.totalSeatNodes > 0) {
    console.log(`\n💺 Seat Map Nodes Detected: ${pageData.totalSeatNodes} total seats`);
    console.log(`   Active Coach: ${pageData.coachName || 'None identified yet'}`);
    console.log(`   DOM Samples:`);
    pageData.sampleSeats.slice(0, 6).forEach(s => {
      console.log(`     Tag: <${s.tag}> | data-seat: "${s.dataSeat}" | text: "${s.text}" | classes: [${s.classes.join(', ')}] | booked: ${s.booked} | selected: ${s.selected}`);
    });
  }

  if (pageData.seatDetails.length > 0) {
    console.log(`\n🧾 Seat Details / Fare Summary Detected:`);
    pageData.seatDetails.slice(0, 3).forEach(d => console.log(`   ${d.slice(0, 100)}...`));
  }

  if (pageData.passengerInputs.length > 0) {
    console.log(`\n👤 Passenger / Contact Form Fields:`);
    pageData.passengerInputs.forEach(i => console.log(`   - [${i.type}] name="${i.name}" id="${i.id}" placeholder="${i.placeholder}" value="${i.value}"`));
  }

  if (pageData.isOtpScreen || pageData.otpInput) {
    console.log(`\n🚨 OTP / VERIFICATION SCREEN REACHED!`);
    console.log(`   OTP Input:`, pageData.otpInput);
  }

  console.log(`\n🔘 Visible Action Buttons:`);
  console.log(pageData.buttons.map(b => `[${b.text}]`).join('  '));

  console.log('\n' + '='.repeat(70) + '\n');
  await browser.close();
}

inspectLive().catch(err => {
  console.error('Inspection error:', err.message);
});
