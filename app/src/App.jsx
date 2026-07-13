import React, { useState, useEffect } from 'react';

import { CartProvider } from './context/CartContext';
import Header from './components/Header';
import CartDrawer from './components/CartDrawer';
import HomePage from './pages/HomePage';
import CheckoutPage from './pages/CheckoutPage';

function App() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(window.location.hash || '#/');

  useEffect(() => {
    const handleHashChange = () => setCurrentRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = (path) => {
    window.location.hash = path;
  };

  return (
    <CartProvider>
      <div className="min-h-screen bg-white flex flex-col">
        <Header 
          onCartClick={() => setIsCartOpen(true)} 
          navigate={navigate} 
          currentRoute={currentRoute}
        />
        <CartDrawer 
          isOpen={isCartOpen} 
          onClose={() => setIsCartOpen(false)} 
          navigate={navigate}
        />
        
        <div className="flex-1 pt-[60px] md:pt-[80px] lg:pt-[100px]">
          {currentRoute === '#/checkout' ? (
            <CheckoutPage navigate={navigate} />
          ) : (
            <HomePage />
          )}
        </div>
      </div>
    </CartProvider>
  )
}

export default App;

