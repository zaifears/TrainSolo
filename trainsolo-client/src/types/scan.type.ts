export type TScan = {
    from: string;
    to: string;
    date: Date | undefined;
    seatClass?: string; // 'ANY' | 'S_CHAIR' | 'SNIGDHA' | 'AC_S' | 'AC_B' | 'SHOVON' etc.
    seatCount?: number; // 1, 2, 3, 4
    preferredTrain?: string; // Optional train name filter
};
