import { chromium } from 'playwright';

async function inspectOtp() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));

  if (!page) {
    console.log('No railway page found.');
    await browser.close();
    return;
  }

  const details = await page.evaluate(() => {
    // 1. OTP Modal / Dialog
    const modal = document.querySelector('.modal, .modal-dialog, .otp-modal, [role="dialog"], .popup');
    const modalText = modal ? (modal as HTMLElement).innerText.trim().replace(/\s+/g, ' ') : null;

    // 2. OTP Inputs
    const otpFields = Array.from(document.querySelectorAll('input[type="number"], input.otp-input, input[placeholder="*"]')).map((el, i) => {
      const inp = el as HTMLInputElement;
      return {
        index: i + 1,
        tagName: inp.tagName,
        type: inp.type,
        className: inp.className,
        id: inp.id,
        placeholder: inp.placeholder,
        maxLength: inp.maxLength,
      };
    });

    // 3. Journey summary on /booking/train/trip-info
    const fullText = document.body.innerText;
    
    // Look for journey details like train name, coach, seat, fare
    const tableRows = Array.from(document.querySelectorAll('tr, .row, .trip-info-item')).map(r => (r as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).filter(t => t.length > 5 && t.length < 150);

    return {
      url: window.location.href,
      modalText,
      otpFields,
      tableRows: tableRows.slice(0, 15),
      fullTextLines: fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(0, 30),
    };
  });

  console.log('='.repeat(70));
  console.log('🎯 LIVE OTP & JOURNEY CONFIRMATION STATE');
  console.log('='.repeat(70));
  console.log(`URL: ${details.url}`);
  console.log('\n📱 OTP Dialog Content:');
  console.log(details.modalText || 'Modal text not captured directly, checking body lines...');

  console.log('\n🔢 OTP Input Fields Detected:');
  console.table(details.otpFields);

  console.log('\n📋 Page Content Lines (Summary):');
  details.fullTextLines.slice(0, 20).forEach(l => console.log(`   > ${l}`));

  console.log('\n' + '='.repeat(70));
  await browser.close();
}

inspectOtp();
