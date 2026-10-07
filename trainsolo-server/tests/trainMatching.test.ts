import { describe, it, expect } from 'vitest';

function extractTrainNumber(tripNumber: string): string {
    const match = tripNumber.match(/\b\d{3,4}\b/);
    return match ? match[0] : '';
}

function normalizeTrainName(str: string): string {
    return (str || '')
        .toUpperCase()
        .replace(/\b(EXPRESS|INTERCITY|COMMUTER|MAIL|SPECIAL)\b/g, '')
        .replace(/H/g, '')
        .replace(/([A-Z])\1+/g, '$1')
        .replace(/[^A-Z0-9]/g, '');
}

function matchesTrain(
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

    return false;
}

describe('TrainSolo Train Matching & Identification', () => {
    it('extracts 3-digit train number 743 from BHRAMMAPUTRA EXPRESS (743)', () => {
        expect(extractTrainNumber('BHRAMMAPUTRA EXPRESS (743)')).toBe('743');
    });

    it('matches Brahmaputra DOM text against Shohoz BHRAMMAPUTRA by train number', () => {
        const domCardText = 'BRAHMAPUTRA EXPRESS (743) Departure: 06:15 PM Available: 40';
        const targetTrain = 'BHRAMMAPUTRA EXPRESS (743)';
        expect(matchesTrain(domCardText, targetTrain)).toBe(true);
    });

    it('matches Brahmaputra DOM text against Shohoz BHRAMMAPUTRA by normalized transliteration even without train number', () => {
        const domCardText = 'BRAHMAPUTRA EXPRESS Departure: 06:15 PM';
        const targetTrain = 'BHRAMMAPUTRA EXPRESS';
        expect(matchesTrain(domCardText, targetTrain)).toBe(true);
    });

    it('never falsely matches Tista Express when targeting Brahmaputra Express', () => {
        const tistaDomCard = 'TISTA EXPRESS (707) Departure: 07:30 AM Available: 1';
        const targetTrain = 'BHRAMMAPUTRA EXPRESS (743)';
        expect(matchesTrain(tistaDomCard, targetTrain)).toBe(false);
    });

    it('matches Tista Express correctly when targeting Tista', () => {
        const tistaDomCard = 'TISTA EXPRESS (707) Departure: 07:30 AM Available: 1';
        const targetTrain = 'TISTA EXPRESS (707)';
        expect(matchesTrain(tistaDomCard, targetTrain)).toBe(true);
    });
});
