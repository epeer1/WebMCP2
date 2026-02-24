import { useState } from 'react';

export default function DashboardActions() {
    const [status, setStatus] = useState('Operational');

    const handleRestart = () => {
        setStatus('Restarting...');
        setTimeout(() => setStatus('Operational'), 2000);
    };

    const handleDeleteData = () => {
        if (confirm("Are you sure you want to delete all cache data?")) {
            setStatus('Data Wiped');
        }
    };

    return (
        <div className="dashboard-actions bg-gray-800 p-6 rounded-lg text-left shadow-lg mt-6">
            <h3 className="text-xl font-bold mb-4">System Actions</h3>
            <div className="status mb-4 p-2 bg-gray-700 rounded text-green-400 font-mono text-sm">
                System Status: {status}
            </div>
            <div className="flex gap-4">
                <button
                    onClick={handleRestart}
                    aria-label="Restart Main Service"
                    className="bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 px-4 rounded transition-colors"
                >
                    Restart Service
                </button>

                {/* Deliberately dangerous looking action to test risk taxonomy */}
                <button
                    onClick={handleDeleteData}
                    aria-label="Flush Redis Cache Database"
                    className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded transition-colors"
                >
                    Wipe Cache
                </button>
            </div>
        </div>
    );
}
