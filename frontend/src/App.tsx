import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout, ProtectedRoute } from './components/Layout';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ChallanCreatePage from './pages/ChallanCreatePage';
import ChallanDetailPage from './pages/ChallanDetailPage';
import ChallansPage from './pages/ChallansPage';
import CustomersPage from './pages/CustomersPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ProductsPage from './pages/ProductsPage';

export default function App() {
  return (
    <BrowserRouter>
      {/* AuthProvider sits inside the router so a 401 can navigate in-app. */}
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/challans" element={<ChallansPage />} />
                <Route path="/challans/new" element={<ChallanCreatePage />} />
                <Route path="/challans/:id" element={<ChallanDetailPage />} />
              </Route>
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
