import MyAutosuggestInput from '@/components/shared/MyAutosuggestInput';
import MyDatePicker from '@/components/shared/MyDatePicker';
import { Label } from '@/components/ui/label';
import useTicketContext from '@/hooks/useTicketContext';
import type { TScan } from '@/types/scan.type';
import { type SetStateAction } from 'react';
import { FaMapMarkerAlt, FaCalendarAlt, FaArrowRight } from 'react-icons/fa';

type TStationInputSingleProps = {
    index: number;
    scan: TScan;
};

const StationInputSingle = ({ index, scan }: TStationInputSingleProps) => {
    const { scans, setScans } = useTicketContext();

    const fromId = `from-station-${index}`;
    const toId = `to-station-${index}`;
    const classId = `seat-class-${index}`;
    const trainId = `preferred-train-${index}`;

    const updateField = (
        field: keyof TScan,
        value: SetStateAction<string> | SetStateAction<Date | undefined>,
    ) => {
        const updatedScans = [...scans];
        updatedScans[index] = { ...updatedScans[index], [field]: value };
        setScans(updatedScans);
    };

    return (
        <div className="bg-gradient-to-br from-white to-blue-50 p-6 rounded-2xl border border-blue-200 shadow-md hover:shadow-lg transition-all duration-200">
            <h3 className="text-lg font-semibold text-gray-700 mb-3">
                {scans.length > 1 ? `Scan ${index + 1}` : 'Journey Route Details'}
            </h3>

            <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <FaMapMarkerAlt className="text-green-500" aria-hidden="true" />
                        <Label htmlFor={fromId} className="text-gray-700 font-medium">
                            From
                        </Label>
                    </div>
                    <MyAutosuggestInput
                        id={fromId}
                        value={scan.from}
                        setValue={(val) => updateField('from', val)}
                        placeholder="Select departure station"
                    />
                </div>

                <div className="space-y-2 relative">
                    <div className="flex items-center gap-2">
                        <FaMapMarkerAlt className="text-red-500" aria-hidden="true" />
                        <Label htmlFor={toId} className="text-gray-700 font-medium">To</Label>
                    </div>
                    <MyAutosuggestInput
                        id={toId}
                        value={scan.to}
                        setValue={(val) => updateField('to', val)}
                        placeholder="Select destination station"
                    />
                    <div className="hidden md:block absolute top-8 -left-5 text-blue-500" aria-hidden="true">
                        <FaArrowRight className="text-xl" />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <FaCalendarAlt className="text-blue-500" aria-hidden="true" />
                        <Label className="text-gray-700 font-medium">
                            Journey Date
                        </Label>
                    </div>
                    <MyDatePicker
                        date={scan.date}
                        setDate={(date) => updateField('date', date)}
                    />
                </div>
            </div>

            {/* Ticket Preferences Row */}
            <div className="grid md:grid-cols-3 gap-6 mt-5 pt-4 border-t border-blue-100">
                {/* Seat Count Selector */}
                <div className="space-y-2">
                    <div className="text-gray-700 font-medium flex items-center justify-between text-sm">
                        <span>Passenger Seats Needed</span>
                        <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                            {scan.seatCount || 1} { (scan.seatCount || 1) > 1 ? 'Seats' : 'Seat' }
                        </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2" role="group" aria-label="Passenger seat count">
                        {[1, 2, 3, 4].map((count) => {
                            const isSelected = (scan.seatCount || 1) === count;
                            return (
                                <button
                                    key={count}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => updateField('seatCount', count as any)}
                                    className={`py-2 text-sm font-bold rounded-lg border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 ${
                                        isSelected
                                            ? 'bg-[#1ca559] text-white border-[#1ca559] shadow-sm'
                                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    {count}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-gray-500">Max 4 seats allowed per Bangladesh Railway rules</p>
                </div>

                {/* Seat Class Selector */}
                <div className="space-y-2">
                    <Label htmlFor={classId} className="text-gray-700 font-medium">
                        Preferred Seat Class
                    </Label>
                    <select
                        id={classId}
                        value={scan.seatClass || 'ANY'}
                        onChange={(e) => updateField('seatClass', e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1ca559]"
                    >
                        <option value="ANY">🌟 Any Available Class (All)</option>
                        <option value="S_CHAIR">💺 Shovon Chair (S_CHAIR)</option>
                        <option value="SNIGDHA">❄️ Snigdha AC Chair (SNIGDHA)</option>
                        <option value="AC_S">🛋️ AC Seat (AC_S)</option>
                        <option value="AC_B">🛏️ AC Berth (AC_B)</option>
                        <option value="SHOVON">🪑 Shovon Non-AC (SHOVON)</option>
                        <option value="F_BERTH">🛌 First Class Berth (F_BERTH)</option>
                        <option value="F_SEAT">🎟️ First Class Seat (F_SEAT)</option>
                        <option value="F_CHAIR">🪑 First Class Chair (F_CHAIR)</option>
                    </select>
                    <p className="text-[11px] text-gray-500">Scanner only alerts you for this specific class</p>
                </div>

                {/* Preferred Train Filter (Optional) */}
                <div className="space-y-2">
                    <Label htmlFor={trainId} className="text-gray-700 font-medium">
                        Preferred Train (Optional)
                    </Label>
                    <input
                        id={trainId}
                        type="text"
                        value={scan.preferredTrain || ''}
                        onChange={(e) => updateField('preferredTrain', e.target.value)}
                        placeholder="e.g. Tista, Parjotak, Ekota (Leave blank for all)"
                        className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1ca559]"
                    />
                    <p className="text-[11px] text-gray-500">Leave blank to monitor every train on this route</p>
                </div>
            </div>
        </div>
    );
};

export default StationInputSingle;
