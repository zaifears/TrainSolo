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
