import React from 'react';
import { X, Minus, Plus, Trash2 } from './Icons';
import { useCart } from '../context/CartContext';

export default function CartDrawer({ isOpen, onClose, navigate }) {
  const { cartItems, updateQuantity, removeFromCart, getCartTotalDisplay } = useCart();

  const handleCheckout = () => {
    onClose();
    navigate('#/checkout');
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div 
        className={`fixed top-0 right-0 h-full w-full sm:w-[400px] bg-white z-50 shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-heading font-bold text-brown">Your Order</h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {cartItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <p className="mb-4">Your cart is empty</p>
              <button 
                onClick={onClose}
                className="px-6 py-2 bg-brown text-white rounded-lg hover:bg-brown/90 transition-colors"
              >
                Browse Menu
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {cartItems.map((item) => (
                <div key={item.id} className="flex gap-4 border-b border-gray-100 pb-4">
                  <img 
                    src={item.image} 
                    alt={item.title} 
                    className="w-20 h-20 object-cover rounded-md"
                  />
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="font-semibold text-brown">{item.title}</h3>
                      <p className="text-sm text-gray-500">${(item.price / 100).toFixed(2)}</p>
                    </div>
                    
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-3 bg-gray-100 rounded-full px-2 py-1">
                        <button 
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="p-1 hover:bg-white rounded-full transition-colors"
                        >
                          <Minus className="w-4 h-4 text-gray-700" />
                        </button>
                        <span className="font-medium text-sm w-4 text-center">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="p-1 hover:bg-white rounded-full transition-colors"
                        >
                          <Plus className="w-4 h-4 text-gray-700" />
                        </button>
                      </div>
                      <button 
                        onClick={() => removeFromCart(item.id)}
                        className="text-red-500 hover:text-red-700 p-2 flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {cartItems.length > 0 && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-between items-center mb-4">
              <span className="font-semibold text-gray-600">Subtotal:</span>
              <span className="text-xl font-bold text-brown">
                {getCartTotalDisplay()}
              </span>
            </div>
            <button 
              onClick={handleCheckout}
              className="w-full bg-brown text-white py-3 rounded-xl font-bold hover:bg-brown/90 transition-colors shadow-lg shadow-brown/30"
            >
              Proceed to Checkout
            </button>
          </div>
        )}
      </div>
    </>
  );
}
