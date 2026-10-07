import { describe, it, expect } from 'vitest';

// --- Core Helper Functions mirroring TrainSolo Production Logic ---

export function extractTrainNumber(tripNumber: string): string {
    const match = tripNumber.match(/\b\d{3,4}\b/);
    return match ? match[0] : '';
}

export function normalizeTrainName(str: string): string {
    return (str || '')
        .toUpperCase()
        .replace(/\b(EXPRESS|INTERCITY|COMMUTER|MAIL|SPECIAL)\b/g, '')
        .replace(/H/g, '')
        .replace(/([A-Z])\1+/g, '$1')
        .replace(/[^A-Z0-9]/g, '');
}

export function matchesSeatClass(text: string, targetClass: string): boolean {
    if (!targetClass || targetClass === 'ANY') return true;
    const upperText = (text || '').toUpperCase().replace(/\s+/g, '_');
    const cleanTarget = targetClass.toUpperCase().replace(/\s+/g, '_');

    // Distinguish SHOVON (Non-AC Bench) from S_CHAIR (Shovon Chair)
    if (cleanTarget === 'SHOVON') {
        if (upperText.includes('CHAIR') || upperText.includes('S_CHAIR') || upperText.includes('চেয়ার')) {
            return false;
        }
        return (
            upperText.includes('SHOVON') ||
            upperText.includes('SOVON') ||
            upperText.includes('NON_AC') ||
            upperText.includes('NON-AC') ||
            upperText.includes('শোভন')
        );
    }

    if (cleanTarget === 'S_CHAIR') {
        return (
            upperText.includes('S_CHAIR') ||
            upperText.includes('SHOVON_CHAIR') ||
            upperText.includes('SOVON_CHAIR') ||
            (upperText.includes('SHOVON') && upperText.includes('CHAIR')) ||
            upperText.includes('শোভন_চেয়ার') ||
            (upperText.includes('শোভন') && upperText.includes('চেয়ার'))
        );
    }

    if (upperText.includes(cleanTarget)) return true;

    const classAliases: Record<string, string[]> = {
        SNIGDHA: ['SNIGDHA', 'AC_CHAIR', 'স্নিগ্ধা'],
        AC_S: ['AC_S', 'AC_SEAT', 'এসি_সিট', 'এসি সিট'],
        AC_B: ['AC_B', 'AC_BERTH', 'এসি_বার্থ', 'এসি বার্থ'],
        F_BERTH: ['F_BERTH', 'FIRST_BERTH', 'ফার্স্ট_বার্থ', 'ফার্স্ট বার্থ'],
        F_SEAT: ['F_SEAT', 'FIRST_SEAT', 'ফার্স্ট_সিট', 'ফার্স্ট সিট'],
        F_CHAIR: ['F_CHAIR', 'FIRST_CHAIR', 'ফার্স্ট_চেয়ার', 'ফার্স্ট চেয়ার'],
    };

    const aliases = classAliases[cleanTarget] || [cleanTarget];
    return aliases.some((alias) => {
        const normAlias = alias.toUpperCase().replace(/\s+/g, '_');
        return upperText.includes(normAlias) || (text || '').toUpperCase().includes(alias.toUpperCase());
    });
}

export interface MockTrainCard {
    id: string;
    text: string;
    hasActiveDropdown?: boolean;
    classRows: {
        className: string;
        availableText: string;
        bookNowDisabled: boolean;
    }[];
}

export function findTargetTrainCard(
    cards: MockTrainCard[],
    targetTrain: string,
    targetTrainNumber?: string,
): MockTrainCard | null {
    if (!cards || cards.length === 0) return null;

    // 0. Active User Context
    const userOpenedCard = cards.find((c) => c.hasActiveDropdown);
    if (userOpenedCard) {
        return userOpenedCard;
    }

    // 1. Train Number Precision Match
    let numberToMatch = targetTrainNumber;
    if (!numberToMatch && targetTrain) {
        const m = targetTrain.match(/\b\d{3,4}\b/);
        if (m) numberToMatch = m[0];
    }

    if (numberToMatch) {
        const numRegex = new RegExp(`\\(${numberToMatch}\\)|\\b${numberToMatch}\\b`);
        for (const c of cards) {
            if (numRegex.test(c.text)) {
                return c;
            }
        }
    }

    // 2. Exact or Substring Match
    if (targetTrain) {
        const upperTarget = targetTrain.toUpperCase().trim();
        for (const c of cards) {
            if (c.text.toUpperCase().includes(upperTarget)) {
                return c;
            }
        }
    }

    // 3. Phonetic and Normalized Transliteration Match
    if (targetTrain) {
        const normTarget = normalizeTrainName(targetTrain);
        if (normTarget.length >= 3) {
            for (const c of cards) {
                const normCard = normalizeTrainName(c.text);
                if (normCard.includes(normTarget) || normTarget.includes(normCard)) {
                    return c;
                }
            }
        }

        // 4. Word Token Match
        const targetWords = targetTrain
            .toUpperCase()
            .split(/[\s()\-]+/)
            .filter((w) => w.length > 3 && !['EXPRESS', 'INTERCITY', 'COMMUTER', 'MAIL'].includes(w));

        for (const c of cards) {
            const cardUpper = c.text.toUpperCase();
            for (const word of targetWords) {
                const normWord = word.replace(/BH/g, 'B').replace(/MM/g, 'M');
                const normTitle = cardUpper.replace(/BH/g, 'B').replace(/MM/g, 'M');
                if (cardUpper.includes(word) || normTitle.includes(normWord)) {
                    return c;
                }
            }
        }
    }

    return null;
}

export interface CoachOption {
    name: string;
    count: number;
    value: string;
}

export function parseCoachOptions(rawTexts: { text: string; value: string }[]): CoachOption[] {
    return rawTexts
        .filter((o) => {
            const text = (o.text || '').trim().toLowerCase();
            return text && !text.includes('select coach') && !text.includes('বগি নির্বাচন');
        })
        .map((o) => {
            const text = o.text.trim();
            const m =
                text.match(/([A-Z0-9_\u0980-\u09FF]+)\s*(?:-|:)\s*(\d+)\s*Seat/i) ||
                text.match(/([A-Z0-9_\u0980-\u09FF]+)\s*\((\d+)\)/i);
            let count = 0;
            if (m) {
                count = parseInt(m[2], 10);
            } else {
                const countOnly = text.match(/(\d+)\s*Seat/i) || text.match(/\((\d+)\)/);
                count = countOnly ? parseInt(countOnly[1], 10) : 0;
            }
            const name = m ? m[1].toUpperCase() : text.split(/[-:(]/)[0].trim().toUpperCase();
            return {
                name,
                count,
                value: o.value,
            };
        });
}

export function selectBestCoach(coaches: CoachOption[], seatsNeeded: number): CoachOption | null {
    if (!coaches || coaches.length === 0) return null;

    // Filter coaches with at least seatsNeeded, sort descending by vacant seats
    const capable = coaches.filter((c) => c.count >= seatsNeeded).sort((a, b) => b.count - a.count);
    if (capable.length > 0) {
        return capable[0];
    }

    // Fallback: coach with maximum available seats > 0
    const available = [...coaches].sort((a, b) => b.count - a.count);
    return available[0]?.count > 0 ? available[0] : null;
}

export interface MockSeatButton {
    label: string;
    className: string;
    disabled: boolean;
}

export function selectAvailableSeats(
    allSeats: MockSeatButton[],
    targetCoachName: string,
    seatsNeeded: number,
): MockSeatButton[] {
    let coachScoped = allSeats.filter((s) => s.label.toUpperCase().startsWith(targetCoachName + '-'));
    if (coachScoped.length === 0) {
        coachScoped = allSeats;
    }

    const available = coachScoped.filter((s) => {
        const cl = s.className;
        const isAvail = (cl.includes('seat-available') || !/seat-booked|seat-in-progress|selected|booked/i.test(cl)) && !s.disabled;
        return isAvail && s.label.trim().length > 0;
    });

    return available.slice(0, seatsNeeded);
}

export function buildBookingUrl(
    from: string,
    to: string,
    date: string,
    seatClass: string,
    trainName: string,
    seats: number,
): string {
    const trainNum = extractTrainNumber(trainName);
    return `https://eticket.railway.gov.bd/booking/train/search?fromcity=${encodeURIComponent(from)}&tocity=${encodeURIComponent(to)}&doj=${encodeURIComponent(date)}&class=${encodeURIComponent(seatClass)}&train=${encodeURIComponent(trainName)}&train_number=${encodeURIComponent(trainNum)}&seats=${seats}#autocut=1`;
}

// ======================================================================
// Comprehensive Test Suite Across 5 Distinct Bangladesh Railway Routes
// ======================================================================

describe('TrainSolo Multi-Route End-to-End Validation (5 Real-World Routes)', () => {
    // ------------------------------------------------------------------
    // ROUTE 1: Dhaka ➔ Mymensingh | Brahmaputra Express (#743) | 3 Seats | S_CHAIR
    // ------------------------------------------------------------------
    describe('Route 1: Dhaka ➔ Mymensingh (Family Booking: 3 Seats, S_CHAIR)', () => {
        const route = { from: 'Dhaka', to: 'Mymensingh', date: '17-Oct-2026', seats: 3, class: 'S_CHAIR' };
        const targetTrainShohoz = 'BHRAMMAPUTRA EXPRESS (743)';

        it('1.1: Generates booking URL with train name, train number, and 3 seats', () => {
            const url = buildBookingUrl(route.from, route.to, route.date, route.class, targetTrainShohoz, route.seats);
            expect(url).toContain('fromcity=Dhaka');
            expect(url).toContain('tocity=Mymensingh');
            expect(url).toContain('train=BHRAMMAPUTRA%20EXPRESS%20(743)');
            expect(url).toContain('train_number=743');
            expect(url).toContain('seats=3');
            expect(url).toContain('#autocut=1');
        });

        it('1.2: Matches BRAHMAPUTRA EXPRESS (743) on DOM and NEVER targets Tista Express (707)', () => {
            const cards: MockTrainCard[] = [
                {
                    id: 'card-707',
                    text: 'TISTA EXPRESS (707) | Departure: 07:30 AM | Available: 1 Seat',
                    classRows: [{ className: 'Shovon Chair', availableText: '1 Seat', bookNowDisabled: false }],
                },
                {
                    id: 'card-743',
                    text: 'BRAHMAPUTRA EXPRESS (743) | Departure: 06:15 PM | Available: 40 Seats',
                    classRows: [{ className: 'Shovon Chair (S_CHAIR)', availableText: '40 Seats', bookNowDisabled: false }],
                },
            ];

            const matched = findTargetTrainCard(cards, targetTrainShohoz, '743');
            expect(matched).not.toBeNull();
            expect(matched?.id).toBe('card-743');
            expect(matched?.text).toContain('BRAHMAPUTRA EXPRESS (743)');
        });

        it('1.3: Resolves class row S_CHAIR to DOM display "Shovon Chair (S_CHAIR)"', () => {
            expect(matchesSeatClass('Shovon Chair (S_CHAIR)', 'S_CHAIR')).toBe(true);
            expect(matchesSeatClass('শোভন চেয়ার', 'S_CHAIR')).toBe(true);
            expect(matchesSeatClass('SNIGDHA', 'S_CHAIR')).toBe(false);
        });

        it('1.4: Selects Coach with maximum vacant seats (GHA with 30 seats) over low-inventory coach', () => {
            const rawCoaches = [
                { text: 'KA - 1 Seat(s)', value: 'KA' },
                { text: 'KHA - 2 Seat(s)', value: 'KHA' },
                { text: 'GHA - 30 Seat(s)', value: 'GHA' },
            ];
            const parsed = parseCoachOptions(rawCoaches);
            const bestCoach = selectBestCoach(parsed, route.seats);
            expect(bestCoach).not.toBeNull();
            expect(bestCoach?.name).toBe('GHA');
            expect(bestCoach?.count).toBe(30);
        });

        it('1.5: Selects exactly 3 seats from Coach GHA', () => {
            const allSeats: MockSeatButton[] = [
                { label: 'GHA-1', className: 'btn-seat seat-available', disabled: false },
                { label: 'GHA-2', className: 'btn-seat seat-available', disabled: false },
                { label: 'GHA-3', className: 'btn-seat seat-available', disabled: false },
                { label: 'GHA-4', className: 'btn-seat seat-available', disabled: false },
                { label: 'GHA-5', className: 'btn-seat seat-booked', disabled: true },
            ];
            const selected = selectAvailableSeats(allSeats, 'GHA', route.seats);
            expect(selected).toHaveLength(3);
            expect(selected.map((s) => s.label)).toEqual(['GHA-1', 'GHA-2', 'GHA-3']);
        });
    });

    // ------------------------------------------------------------------
    // ROUTE 2: Dhaka ➔ Chattogram | Suborno Express (#701) | 2 Seats | SNIGDHA
    // ------------------------------------------------------------------
    describe('Route 2: Dhaka ➔ Chattogram (Couple Booking: 2 Seats, SNIGDHA)', () => {
        const route = { from: 'Dhaka', to: 'Chattogram', date: '18-Oct-2026', seats: 2, class: 'SNIGDHA' };
        const targetTrain = 'SUBORNO EXPRESS (701)';

        it('2.1: Generates booking URL with train #701 and SNIGDHA class', () => {
            const url = buildBookingUrl(route.from, route.to, route.date, route.class, targetTrain, route.seats);
            expect(url).toContain('tocity=Chattogram');
            expect(url).toContain('class=SNIGDHA');
            expect(url).toContain('train_number=701');
            expect(url).toContain('seats=2');
        });

        it('2.2: Precision matches SUBORNO EXPRESS (701) among multiple Chattogram trains', () => {
            const cards: MockTrainCard[] = [
                { id: 'c-703', text: 'MAHANAGAR PROVATI (703) | 07:45 AM', classRows: [] },
                { id: 'c-701', text: 'SUBORNO EXPRESS (701) | 04:30 PM', classRows: [] },
                { id: 'c-787', text: 'SONAR BANGLA EXPRESS (787) | 07:00 AM', classRows: [] },
            ];
            const matched = findTargetTrainCard(cards, targetTrain, '701');
            expect(matched?.id).toBe('c-701');
        });

        it('2.3: Matches SNIGDHA to "AC CHAIR" and Bengali "স্নিগ্ধা"', () => {
            expect(matchesSeatClass('AC CHAIR', 'SNIGDHA')).toBe(true);
            expect(matchesSeatClass('স্নিগ্ধা', 'SNIGDHA')).toBe(true);
            expect(matchesSeatClass('SNIGDHA', 'SNIGDHA')).toBe(true);
            expect(matchesSeatClass('SHOVON CHAIR', 'SNIGDHA')).toBe(false);
        });

        it('2.4: Selects coach with >= 2 seats and locks exactly 2 seats', () => {
            const rawCoaches = [
                { text: 'JA - 1 Seat', value: 'JA' },
                { text: 'JHA - 18 Seats', value: 'JHA' },
            ];
            const parsed = parseCoachOptions(rawCoaches);
            const best = selectBestCoach(parsed, route.seats);
            expect(best?.name).toBe('JHA');

            const seats: MockSeatButton[] = [
                { label: 'JHA-10', className: 'btn-seat seat-available', disabled: false },
                { label: 'JHA-11', className: 'btn-seat seat-available', disabled: false },
                { label: 'JHA-12', className: 'btn-seat seat-available', disabled: false },
            ];
            const selected = selectAvailableSeats(seats, 'JHA', route.seats);
            expect(selected).toHaveLength(2);
            expect(selected.map((s) => s.label)).toEqual(['JHA-10', 'JHA-11']);
        });
    });

    // ------------------------------------------------------------------
    // ROUTE 3: Dhaka ➔ Cox's Bazar | Parjotak Express (#815) | 4 Seats | S_CHAIR
    // ------------------------------------------------------------------
    describe("Route 3: Dhaka ➔ Cox's Bazar (Party Booking: 4 Seats, S_CHAIR)", () => {
        const route = { from: 'Dhaka', to: "Cox's Bazar", date: '20-Oct-2026', seats: 4, class: 'S_CHAIR' };
        const targetTrain = 'PARJOTAK EXPRESS (815)';

        it('3.1: Encodes apostrophe in Cox\'s Bazar and sets max party size 4', () => {
            const url = buildBookingUrl(route.from, route.to, route.date, route.class, targetTrain, route.seats);
            expect(url).toContain("tocity=Cox's%20Bazar");
            expect(url).toContain('train_number=815');
            expect(url).toContain('seats=4');
        });

        it('3.2: Matches Parjotak Express (815) and avoids Cox\'s Bazar Express (813)', () => {
            const cards: MockTrainCard[] = [
                { id: 'c-813', text: "COX'S BAZAR EXPRESS (813) | 10:30 PM", classRows: [] },
                { id: 'c-815', text: 'PARJOTAK EXPRESS (815) | 06:15 AM', classRows: [] },
            ];
            const matched = findTargetTrainCard(cards, targetTrain, '815');
            expect(matched?.id).toBe('c-815');
        });

        it('3.3: Rejects coach with 3 seats (insufficient for 4) and picks coach with 20 seats', () => {
            const rawCoaches = [
                { text: 'CHA - 3 Seats', value: 'CHA' }, // Less than 4!
                { text: 'CHHA - 20 Seats', value: 'CHHA' }, // >= 4!
            ];
            const parsed = parseCoachOptions(rawCoaches);
            const best = selectBestCoach(parsed, route.seats);
            expect(best?.name).toBe('CHHA');
            expect(best?.count).toBe(20);
        });

        it('3.4: Selects all 4 seats for the family without failing', () => {
            const seats: MockSeatButton[] = [
                { label: 'CHHA-1', className: 'btn-seat seat-available', disabled: false },
                { label: 'CHHA-2', className: 'btn-seat seat-available', disabled: false },
                { label: 'CHHA-3', className: 'btn-seat seat-available', disabled: false },
                { label: 'CHHA-4', className: 'btn-seat seat-available', disabled: false },
                { label: 'CHHA-5', className: 'btn-seat seat-available', disabled: false },
            ];
            const selected = selectAvailableSeats(seats, 'CHHA', route.seats);
            expect(selected).toHaveLength(4);
            expect(selected.map((s) => s.label)).toEqual(['CHHA-1', 'CHHA-2', 'CHHA-3', 'CHHA-4']);
        });
    });

    // ------------------------------------------------------------------
    // ROUTE 4: Dhaka ➔ Sylhet | Parabat Express (#709) | 1 Seat | AC_S
    // ------------------------------------------------------------------
    describe('Route 4: Dhaka ➔ Sylhet (Solo Booking: 1 Seat, AC_S)', () => {
        const route = { from: 'Dhaka', to: 'Sylhet', date: '21-Oct-2026', seats: 1, class: 'AC_S' };
        const targetTrain = 'PARABAT EXPRESS (709)';

        it('4.1: Generates booking URL with train #709 and AC_S', () => {
            const url = buildBookingUrl(route.from, route.to, route.date, route.class, targetTrain, route.seats);
            expect(url).toContain('tocity=Sylhet');
            expect(url).toContain('class=AC_S');
            expect(url).toContain('train_number=709');
            expect(url).toContain('seats=1');
        });

        it('4.2: Matches Parabat Express (709) and rejects Upaban/Jayantika', () => {
            const cards: MockTrainCard[] = [
                { id: 'c-709', text: 'PARABAT EXPRESS (709) | 06:20 AM', classRows: [] },
                { id: 'c-717', text: 'JAYANTIKA EXPRESS (717) | 11:15 AM', classRows: [] },
                { id: 'c-739', text: 'UPABAN EXPRESS (739) | 08:30 PM', classRows: [] },
            ];
            const matched = findTargetTrainCard(cards, targetTrain, '709');
            expect(matched?.id).toBe('c-709');
        });

        it('4.3: Matches AC_S to "AC SEAT", "AC_SEAT", and Bengali "এসি সিট"', () => {
            expect(matchesSeatClass('AC SEAT', 'AC_S')).toBe(true);
            expect(matchesSeatClass('এসি সিট', 'AC_S')).toBe(true);
            expect(matchesSeatClass('AC_S', 'AC_S')).toBe(true);
            expect(matchesSeatClass('SNIGDHA', 'AC_S')).toBe(false);
        });

        it('4.4: Selects single seat cleanly', () => {
            const seats: MockSeatButton[] = [
                { label: 'KA-15', className: 'btn-seat seat-available', disabled: false },
                { label: 'KA-16', className: 'btn-seat seat-booked', disabled: true },
            ];
            const selected = selectAvailableSeats(seats, 'KA', route.seats);
            expect(selected).toHaveLength(1);
            expect(selected[0].label).toBe('KA-15');
        });
    });

    // ------------------------------------------------------------------
    // ROUTE 5: Dhaka ➔ Khulna | Sundarban Express (#725) | 2 Seats | SHOVON
    // ------------------------------------------------------------------
    describe('Route 5: Dhaka ➔ Khulna (Non-AC Booking: 2 Seats, SHOVON)', () => {
        const route = { from: 'Dhaka', to: 'Khulna', date: '22-Oct-2026', seats: 2, class: 'SHOVON' };
        const targetTrain = 'SUNDARBAN EXPRESS (725)';

        it('5.1: Generates booking URL with train #725 and SHOVON', () => {
            const url = buildBookingUrl(route.from, route.to, route.date, route.class, targetTrain, route.seats);
            expect(url).toContain('tocity=Khulna');
            expect(url).toContain('class=SHOVON');
            expect(url).toContain('train_number=725');
            expect(url).toContain('seats=2');
        });

        it('5.2: Matches Sundarban Express (725) and rejects Chitra Express (763)', () => {
            const cards: MockTrainCard[] = [
                { id: 'c-725', text: 'SUNDARBAN EXPRESS (725) | 08:15 AM', classRows: [] },
                { id: 'c-763', text: 'CHITRA EXPRESS (763) | 07:00 PM', classRows: [] },
            ];
            const matched = findTargetTrainCard(cards, targetTrain, '725');
            expect(matched?.id).toBe('c-725');
        });

        it('5.3: Matches SHOVON to "NON AC", "NON-AC", and Bengali "শোভন"', () => {
            expect(matchesSeatClass('NON AC', 'SHOVON')).toBe(true);
            expect(matchesSeatClass('NON-AC', 'SHOVON')).toBe(true);
            expect(matchesSeatClass('শোভন', 'SHOVON')).toBe(true);
            expect(matchesSeatClass('SHOVON CHAIR', 'SHOVON')).toBe(false);
        });

        it('5.4: Selects 2 seats in Coach THA', () => {
            const rawCoaches = [
                { text: 'TA - 1 Seat', value: 'TA' },
                { text: 'THA - 12 Seats', value: 'THA' },
            ];
            const parsed = parseCoachOptions(rawCoaches);
            const best = selectBestCoach(parsed, route.seats);
            expect(best?.name).toBe('THA');

            const seats: MockSeatButton[] = [
                { label: 'THA-5', className: 'btn-seat seat-available', disabled: false },
                { label: 'THA-6', className: 'btn-seat seat-available', disabled: false },
            ];
            const selected = selectAvailableSeats(seats, 'THA', route.seats);
            expect(selected).toHaveLength(2);
            expect(selected.map((s) => s.label)).toEqual(['THA-5', 'THA-6']);
        });
    });

    // ------------------------------------------------------------------
    // BONUS SAFETY TESTS: Zero-Fallback Guarantee & Active Dropdown Priority
    // ------------------------------------------------------------------
    describe('Safety & Fallback Guarantees', () => {
        it('Strict Zero-Fallback: Returns null when requested train is absent, NEVER picking cards[0]', () => {
            const cards: MockTrainCard[] = [
                { id: 'c-707', text: 'TISTA EXPRESS (707)', classRows: [] },
                { id: 'c-743', text: 'BRAHMAPUTRA EXPRESS (743)', classRows: [] },
            ];
            // Searching for Mohanganj Express (789) which is not in cards
            const matched = findTargetTrainCard(cards, 'MOHANGANJ EXPRESS (789)', '789');
            expect(matched).toBeNull(); // Absolute abort, zero fallback!
        });

        it('Active User Context: Prioritizes train card with open #select-bogie even if targetTrain differs', () => {
            const cards: MockTrainCard[] = [
                { id: 'c-707', text: 'TISTA EXPRESS (707)', classRows: [] },
                { id: 'c-743', text: 'BRAHMAPUTRA EXPRESS (743)', classRows: [], hasActiveDropdown: true },
            ];
            // Even if URL has Tista, if user manually opened Brahmaputra, user opened card takes precedence!
            const matched = findTargetTrainCard(cards, 'TISTA EXPRESS (707)', '707');
            expect(matched?.id).toBe('c-743');
        });
    });
});
