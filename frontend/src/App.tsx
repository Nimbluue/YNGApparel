import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './context/AuthContext';
import { queryClient } from './lib/queryClient';
import AppRoutes from './routes/AppRoutes';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
