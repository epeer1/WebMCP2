import React from 'react';

interface DashboardProps {
  userName: string;
}

export default function Dashboard({ userName }: DashboardProps) {
  return (
    <div>
      <h1>Welcome back, {userName}</h1>
      <p>Your stats for today</p>
      <div className="stats-grid">
        <div className="stat-card">
          <span>Visitors</span>
          <strong>1,234</strong>
        </div>
        <div className="stat-card">
          <span>Revenue</span>
          <strong>$5,678</strong>
        </div>
      </div>
    </div>
  );
}
