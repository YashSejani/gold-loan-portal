import { Route, Routes } from 'react-router';
import { Header } from './components/Header';
import { AdminPage } from './pages/Admin';
import { ApplyPage } from './pages/Apply';

export function App() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Routes>
          <Route path="/" element={<ApplyPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
