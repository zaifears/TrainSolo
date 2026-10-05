import { chromium } from 'playwright';

async function inspectCoachDropdownDOM() {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const page = browser.contexts()[0]?.pages().find(p => p.url().includes('railway.gov.bd'));
  if (!page) {
    console.log('No railway page found in Brave.');
    await browser.close();
    return;
  }

  const dropdownInfo = await page.evaluate(() => {
    // Look around "Select Coach" text
    const label = Array.from(document.querySelectorAll('label, h4, h5, div, span')).find(
      el => el.textContent?.trim().toLowerCase() === 'select coach'
    );

    const parent = label ? label.parentElement : document.body;

    // Find all selects or custom dropdowns inside or adjacent to parent
    const selects = Array.from(document.querySelectorAll('select')).map(s => ({
      tagName: s.tagName,
      id: s.id,
      className: s.className,
      value: s.value,
      options: Array.from(s.options).map(o => ({ value: o.value, text: o.text.trim() })),
    }));

    // Find custom dropdown components like ng-select, mat-select, custom div dropdowns
    const customDropdowns = Array.from(
      document.querySelectorAll('ng-select, .ng-select, .custom-select, [role="combobox"], [role="listbox"], .dropdown, .select-coach-wrapper')
    ).map(cd => ({
      tagName: cd.tagName,
      className: cd.className,
      id: cd.id,
      text: cd.textContent?.replace(/\s+/g, ' ').trim(),
      html: cd.outerHTML.slice(0, 300),
    }));

    // Look for the specific element showing "KHA - 0 Seat(s)"
    const khaElement = Array.from(document.querySelectorAll('*')).find(
      el => el.children.length === 0 && el.textContent?.trim().includes('KHA - 0 Seat(s)')
    );

    let khaParentHTML = null;
    if (khaElement) {
      const p = khaElement.closest('.form-group, .select-wrapper, div, .ng-select') || khaElement.parentElement;
      khaParentHTML = p ? p.outerHTML.slice(0, 500) : null;
    }

    return {
      selects,
      customDropdowns,
      khaFound: Boolean(khaElement),
      khaTag: khaElement?.tagName,
      khaParentHTML,
    };
  });

  console.log('========================================================');
  console.log('COACH DROPDOWN DOM INSPECTION:');
  console.log('========================================================');
  console.log('Native Selects found:', JSON.stringify(dropdownInfo.selects, null, 2));
  console.log('Custom Dropdowns found:', JSON.stringify(dropdownInfo.customDropdowns, null, 2));
  console.log('Element showing "KHA - 0 Seat(s)":', dropdownInfo.khaFound, dropdownInfo.khaTag);
  if (dropdownInfo.khaParentHTML) {
    console.log('Parent HTML of KHA element:\n', dropdownInfo.khaParentHTML);
  }
  console.log('========================================================');

  await browser.close();
}

inspectCoachDropdownDOM();
