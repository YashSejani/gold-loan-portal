import { Route, Routes } from 'react-router';
import { Header } from './components/Header';
import { OfflineBanner } from './components/OfflineBanner';
import { AdminPage } from './pages/Admin';
import { ApplyPage } from './pages/Apply';

export function App() {
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only rounded-lg bg-white font-medium text-brand-800 shadow focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:inline-flex focus:min-h-11 focus:items-center focus:px-4 focus-visible:outline-2 focus-visible:outline-brand-700"
      >
        Skip to main content
      </a>
      <Header />
      <OfflineBanner />
      <main id="main" tabIndex={-1} className="px-4 py-6 focus:outline-none sm:py-10">
        <Routes>
          <Route path="/" element={<ApplyPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
