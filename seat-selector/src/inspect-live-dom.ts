import { chromium } from 'playwright';

async function inspectLiveDom() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const contexts = browser.contexts();
  let railwayPage = null;

  for (const ctx of contexts) {
    for (const page of ctx.pages()) {
      if (page.url().includes('railway.gov.bd')) {
        railwayPage = page;
        break;
      }
    }
  }

  if (!railwayPage) {
    console.log('No Railway page found!');
    await browser.close();
    return;
  }

  console.log('Active URL:', railwayPage.url());

  const inspection = await railwayPage.evaluate(() => {
    // 1. Inspect Coach Select and surrounding container
    const bogieSelect = document.querySelector('#select-bogie') || document.querySelector('select.selectpicker') || document.querySelector('select');
    const bogieInfo = bogieSelect ? {
      id: bogieSelect.id,
      className: bogieSelect.className,
      tagName: bogieSelect.tagName,
      value: (bogieSelect as HTMLSelectElement).value,
      options: Array.from((bogieSelect as HTMLSelectElement).options).map(o => ({
        text: o.text,
        value: o.value,
        selected: o.selected
      })),
      parentClass: bogieSelect.parentElement?.className,
      parentHtmlSnippet: bogieSelect.parentElement?.outerHTML.slice(0, 300)
    } : null;

    // Check bootstrap-select elements
    const bsSelect = document.querySelector('.bootstrap-select, .bogie-selection');
    const bsInfo = bsSelect ? {
      className: bsSelect.className,
      innerBtnText: bsSelect.querySelector('button')?.innerText,
      dropdownItems: Array.from(bsSelect.querySelectorAll('.dropdown-menu li, .dropdown-menu a')).map(el => el.textContent?.trim())
    } : null;

    // 2. Inspect Seat Elements
    const seatButtons = Array.from(document.querySelectorAll('button.btn-seat, .btn-seat'));
    const seatList = seatButtons.map(b => ({
      text: b.textContent?.trim(),
      className: b.className,
      disabled: (b as HTMLButtonElement).disabled,
      title: b.getAttribute('title') || '',
    })).filter(s => s.text || !s.className.includes('seat-hidden'));

    // Check continue purchase button
    const continueBtn = document.querySelector('button.continue-btn');
    const continueBtnInfo = continueBtn ? {
      text: continueBtn.textContent?.trim(),
      className: continueBtn.className,
      disabled: (continueBtn as HTMLButtonElement).disabled,
      visible: (continueBtn as HTMLElement).offsetParent !== null,
    } : null;

    return {
      bogieValue: (document.querySelector('#select-bogie') as HTMLSelectElement)?.value,
      totalSeats: seatList.length,
      seats: seatList,
      continueBtn: continueBtnInfo
    };
  });

  console.log('DOM Inspection Result:\n', JSON.stringify(inspection, null, 2));
  await browser.close();
}

inspectLiveDom().catch(console.error);
