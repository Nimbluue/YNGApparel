import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { WishlistProvider } from './context/WishlistContext';
import { queryClient } from './lib/queryClient';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <LanguageProvider>
            <ToastProvider>
              <WishlistProvider>
                <AppRoutes />
              </WishlistProvider>
            </ToastProvider>
          </LanguageProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
