import { useState } from 'react';

export default function SettingsForm() {
    const [username, setUsername] = useState('agent_smith');
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [theme, setTheme] = useState('dark');

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log("Saving settings...", { username, notificationsEnabled, theme });
        await new Promise(r => setTimeout(r, 500)); // Simulate API
        alert("Settings saved!");
    }

    return (
        <div className="settings-panel bg-gray-800 p-6 rounded-lg text-left shadow-lg">
            <h2 className="text-2xl font-bold mb-4">User Settings</h2>
            <form id="settings-form" onSubmit={handleSave} className="flex flex-col gap-4">

                <div className="field-group">
                    <label className="block text-sm font-medium mb-1">Username</label>
                    <input
                        type="text"
                        name="username"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:border-blue-500 outline-none"
                        placeholder="Enter new username"
                    />
                </div>

                <div className="field-group flex items-center gap-2">
                    <input
                        type="checkbox"
                        id="notifs"
                        checked={notificationsEnabled}
                        onChange={e => setNotificationsEnabled(e.target.checked)}
                        className="w-4 h-4 rounded text-blue-500"
                    />
                    <label htmlFor="notifs" className="text-sm">Enable Email Notifications</label>
                </div>

                <div className="field-group">
                    <label className="block text-sm font-medium mb-1">Theme Preference</label>
                    <select
                        value={theme}
                        onChange={e => setTheme(e.target.value)}
                        className="w-full p-2 rounded bg-gray-700 border border-gray-600 outline-none"
                        aria-label="Select Theme"
                    >
                        <option value="light">Light Mode</option>
                        <option value="dark">Dark Mode</option>
                        <option value="system">System Default</option>
                    </select>
                </div>

                <button
                    type="submit"
                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
                >
                    Save Preferences
                </button>
            </form>
        </div>
    )
}
