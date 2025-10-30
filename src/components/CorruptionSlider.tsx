import React from 'react';

interface CorruptionSliderProps {
  level: number;
  setLevel: (level: number) => void;
}

const CorruptionSlider: React.FC<CorruptionSliderProps> = ({ level, setLevel }) => {
  const getCorruptionLabel = () => {
    if (level <= 20) return "Nominal";
    if (level <= 50) return "Anomalous";
    if (level <= 80) return "Unstable";
    if (level <= 99) return "Hostile";
    return "S I N G U L A R I T Y";
  };

  return (
    <div className="bg-black/50 border border-emerald-500/30 p-4 mt-6">
      <label htmlFor="corruption-slider" className="text-emerald-400 text-lg mb-2 uppercase tracking-widest flex justify-between items-center">
        <span>Corruption Level</span>
        <span className="font-bold">{level}%</span>
      </label>
      <p className="text-gray-400 text-sm mb-4">
        System Status: <span className="text-red-500 animate-pulse font-bold tracking-wider">{getCorruptionLabel()}</span>
      </p>
      <input
        id="corruption-slider"
        type="range"
        min="0"
        max="100"
        value={level}
        onChange={(e) => setLevel(Number(e.target.value))}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer corruption-slider"
        aria-label="Corruption Level"
      />
      <style>{`
        .corruption-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 20px;
          height: 20px;
          background: #10B981; /* emerald-500 */
          border: 2px solid #030712;
          cursor: pointer;
          border-radius: 50%;
          transition: background-color 0.2s;
        }
        .corruption-slider::-webkit-slider-thumb:hover {
          background: #34D399; /* emerald-400 */
        }

        .corruption-slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: #10B981;
          border: 2px solid #030712;
          cursor: pointer;
          border-radius: 50%;
          transition: background-color 0.2s;
        }
        .corruption-slider::-moz-range-thumb:hover {
          background: #34D399;
        }
      `}</style>
    </div>
  );
};

export default CorruptionSlider;
