import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App.jsx'
import DriverView from './pages/DriverView.jsx'
import ClientPortal from './pages/ClientPortal.jsx'
import AdminPage from './pages/AdminPage.jsx'
import './index.css'
import { NotificationProvider } from './components/NotificationContext'
import { AuthProvider } from './components/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import LoginPage from './pages/LoginPage.jsx'

// Experimental route-based navigation
import ExperimentalLayout from './experimental/ExperimentalLayout.jsx'
import SchedulePage from './experimental/pages/SchedulePage.jsx'
import MenuBuilderPage from './experimental/pages/MenuBuilderPage.jsx'
import DishTotalsPage from './experimental/pages/DishTotalsPage.jsx'
import ShoppingListPage from './experimental/pages/ShoppingListPage.jsx'
import RecipesPage from './experimental/pages/RecipesPage.jsx'
import IngredientsPage from './experimental/pages/IngredientsPage.jsx'
import ClientsDirectoryPage from './experimental/pages/ClientsDirectoryPage.jsx'
import HistoryPage from './experimental/pages/HistoryPage.jsx'
import GroceryBillingPage from './experimental/pages/GroceryBillingPage.jsx'


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <NotificationProvider>
      <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/driver" element={<ErrorBoundary><DriverView /></ErrorBoundary>} />
          <Route path="/client/:id" element={<ErrorBoundary><ClientPortal /></ErrorBoundary>} />

          {/* Protected routes */}
          <Route path="/" element={<ProtectedRoute><ErrorBoundary><App /></ErrorBoundary></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><ErrorBoundary><AdminPage /></ErrorBoundary></ProtectedRoute>} />

          {/* Experimental route-based navigation (protected) */}
          <Route path="/test" element={<ProtectedRoute><ExperimentalLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/test/schedule" replace />} />
            <Route path="schedule" element={<SchedulePage />} />
            <Route path="menu/builder" element={<MenuBuilderPage />} />
            <Route path="kitchen">
              <Route index element={<Navigate to="/test/kitchen/dish-totals" replace />} />
              <Route path="dish-totals" element={<DishTotalsPage />} />
              <Route path="shopping-list" element={<ShoppingListPage />} />
              <Route path="recipes" element={<RecipesPage />} />
              <Route path="ingredients" element={<IngredientsPage />} />
            </Route>
            <Route path="clients">
              <Route index element={<Navigate to="/test/clients/directory" replace />} />
              <Route path="directory" element={<ClientsDirectoryPage />} />
              <Route path="history" element={<HistoryPage />} />
            </Route>
            <Route path="finance">
              <Route index element={<Navigate to="/test/finance/grocery-billing" replace />} />
              <Route path="grocery-billing" element={<GroceryBillingPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
      </AuthProvider>
      </NotificationProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
