import SettingsForm from './components/SettingsForm';
import DashboardActions from './components/DashboardActions';
import './App.css'

function App() {
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="mb-8 border-b border-gray-700 pb-4">
        <h1 className="text-4xl font-extrabold text-blue-400 tracking-tight">System Admin Console</h1>
        <p className="text-gray-400 mt-2">Manage settings and perform system operations</p>
      </header>

      <main className="max-w-4xl mx-auto flex flex-col gap-6">
        <SettingsForm />
        <DashboardActions />
      </main>
    </div>
  )
}

export default App
