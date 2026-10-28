import { Route, Routes } from 'react-router';
import { Header } from './components/Header';
import { AdminPage } from './pages/Admin';
import { ApplyPage } from './pages/Apply';

export function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="px-4 py-6 sm:py-10">
        <Routes>
          <Route path="/" element={<ApplyPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
