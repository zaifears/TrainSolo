export const VAT_CLASSES = [
    'AC_B',
    'AC_S',
    'SNIGDHA',
    'F_BERTH',
    'F_SEAT',
    'F_CHAIR',
    'AC_CHAIR',
];

export function calculateFareWithVat(baseFare: number, seatClass: string): number {
    return VAT_CLASSES.includes(seatClass.toUpperCase())
        ? Math.round(baseFare + baseFare * 0.15)
        : baseFare;
}

export function extractTrainNumber(tripNumber: string): string {
    const match = (tripNumber || '').match(/\b\d{3,4}\b/);
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

export function matchesTrain(
    cardText: string,
    targetTrain: string,
    targetTrainNumber?: string,
): boolean {
    const numberToMatch =
        targetTrainNumber || extractTrainNumber(targetTrain);
    if (numberToMatch) {
        const numRegex = new RegExp(`\\(${numberToMatch}\\)|\\b${numberToMatch}\\b`);
        if (numRegex.test(cardText)) {
            return true;
        }
    }

    if (targetTrain && cardText.toUpperCase().includes(targetTrain.toUpperCase())) {
        return true;
    }

    const normTarget = normalizeTrainName(targetTrain);
    const normCard = normalizeTrainName(cardText);
    if (normTarget.length >= 3 && (normCard.includes(normTarget) || normTarget.includes(normCard))) {
        return true;
    }

    // Word token match with transliteration normalization
    if (targetTrain) {
        const targetWords = targetTrain
            .toUpperCase()
            .split(/[\s()\-]+/)
            .filter((w) => w.length > 3 && !['EXPRESS', 'INTERCITY', 'COMMUTER', 'MAIL'].includes(w));

        const cardUpper = cardText.toUpperCase();
        for (const word of targetWords) {
            const normWord = word.replace(/BH/g, 'B').replace(/MM/g, 'M');
            const normTitle = cardUpper.replace(/BH/g, 'B').replace(/MM/g, 'M');
            if (cardUpper.includes(word) || normTitle.includes(normWord)) {
                return true;
            }
        }
    }

    return false;
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

export interface ITrainCardLike {
    id?: string;
    text: string;
    hasActiveDropdown?: boolean;
    [key: string]: unknown;
}

/**
 * Canonical helper for locating the target train card.
 * In production, explicit target train strictly takes precedence;
 * an arbitrary open dropdown NEVER overrides an explicit target train.
 */
export function findTargetTrainCard<T extends ITrainCardLike>(
    cards: T[],
    targetTrain?: string,
    targetTrainNumber?: string,
): T | null {
    if (!cards || cards.length === 0) return null;

    if (targetTrain || targetTrainNumber) {
        for (const card of cards) {
            if (matchesTrain(card.text, targetTrain || '', targetTrainNumber)) {
                return card;
            }
        }
        // Strict Zero-Fallback: when a specific train is targeted but not found, return null!
        return null;
    }

    // Only if no explicit train target was configured, check if user already opened a card
    const active = cards.find((c) => c.hasActiveDropdown);
    if (active) return active;

    return cards[0] || null;
}
