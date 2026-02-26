import { Shield, Activity, Users } from 'lucide-react';
import { SettingsModal } from './components/SettingsModal';
import { DataTable } from './components/DataTable';

export default function App() {
  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col font-sans">

      {/* Top Navbar */}
      <header className="flex h-16 items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-6 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-indigo-500" />
          <h1 className="text-xl font-bold tracking-tight">Acme Admin</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-semibold">
            AD
          </div>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full flex flex-col gap-8">

        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-white mb-1">Command Center</h2>
            <p className="text-zinc-400">Manage your application infrastructure and user access.</p>
          </div>

          <div className="flex gap-3">
            {/* The Highly Complex Radix UI Portal Modal */}
            <SettingsModal />
          </div>
        </div>

        {/* System Status Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-400">System Uptime</h3>
              <Activity className="h-4 w-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold">99.99%</div>
            <p className="text-xs text-zinc-500">+0.1% from last month</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-400">Active Users</h3>
              <Users className="h-4 w-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold">14,204</div>
            <p className="text-xs text-zinc-500">+12% from last week</p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-400">Pending Alerts</h3>
              <Shield className="h-4 w-4 text-red-500" />
            </div>
            <div className="text-2xl font-bold text-red-400">3</div>
            <p className="text-xs text-zinc-500">Requires immediate attention</p>
          </div>
        </div>

        {/* The Highly Complex Checkbox Data List */}
        <DataTable />

      </main>
    </div>
  );
}
