import React, { useState } from 'react';

export default function SettingsPage() {
  const [name, setName] = useState('');

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  };

  const handleExportData = async () => {
    const res = await fetch('/api/export', { method: 'GET' });
    const blob = await res.blob();
    // download logic...
  };

  const handleDeleteAccount = async () => {
    if (confirm('Are you sure? This cannot be undone.')) {
      await fetch('/api/account', { method: 'DELETE' });
    }
  };

  return (
    <div>
      <h2>Profile Settings</h2>

      <form onSubmit={handleUpdateProfile}>
        <input
          id="display-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Display name"
        />
        <button type="submit">Save Changes</button>
      </form>

      <hr />

      <button onClick={handleExportData}>Export My Data</button>

      <button onClick={handleDeleteAccount} className="danger">
        Delete Account
      </button>
    </div>
  );
}
