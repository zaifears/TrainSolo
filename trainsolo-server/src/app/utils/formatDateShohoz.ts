import { monthNames } from '../constants/month.constant';

const formatDateShohoz = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const [year, monthNum, day] = parts;
        const monthIndex = parseInt(monthNum, 10) - 1;
        const month = monthNames[monthIndex];
        if (month) {
            return `${day.padStart(2, '0')}-${month}-${year}`;
        }
    }
    const date = new Date(dateStr);
    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = monthNames[date.getUTCMonth()];
    const year = date.getUTCFullYear();
    return `${day}-${month}-${year}`;
};

export default formatDateShohoz;
