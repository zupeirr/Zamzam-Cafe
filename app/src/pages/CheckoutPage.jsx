import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { ArrowLeft, CheckCircle2 } from '../components/Icons';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function CheckoutPage({ navigate }) {
  const { cartItems, getCartTotal, clearCart } = useCart();
  
  const [orderType, setOrderType] = useState('dine-in');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    tableNumber: '',
    pickupTime: '',
    address: '',
    landmark: '',
    notes: ''
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // All prices in integer CENTS
  const subtotalCents  = getCartTotal();            // e.g. 154
  const deliveryFeeCents = orderType === 'delivery' ? 200 : 0;
  const totalCents     = subtotalCents + deliveryFeeCents;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setApiError('');

    const payload = {
      customer: {
        fullName: formData.fullName,
        phone: formData.phone,
        tableNumber: formData.tableNumber,
        pickupTime: formData.pickupTime,
        address: formData.address,
        landmark: formData.landmark,
      },
      orderType,
      items: cartItems.map(item => ({
        id: item.id,
        title: item.title,
        price: item.price,
        quantity: item.quantity,
      })),
      paymentMethod,
      notes: formData.notes,
      totalAmount: totalCents,     // send integer cents to server
    };

    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to place order.');
      }

      clearCart();
      setConfirmedOrder(data.order);
      setIsSuccess(true);
    } catch (err) {
      setApiError(err.message || 'Could not connect to server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess && confirmedOrder) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h2 className="text-3xl font-heading font-bold text-brown mb-2">Order Confirmed!</h2>

          {/* Order Details */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-left">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">Order ID</span>
              <span className="font-mono font-bold text-brown">{confirmedOrder.id}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">Status</span>
              <span className="capitalize text-sm font-semibold text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">{confirmedOrder.status}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Estimated Time</span>
              <span className="text-sm font-semibold text-gray-700">{confirmedOrder.estimatedTime}</span>
            </div>
          </div>

          <p className="text-gray-600 mb-8">
            {orderType === 'dine-in' ? 'Your order will be brought to your table shortly.' : 
             orderType === 'takeaway' ? 'Your order will be ready for pickup soon.' : 
             'Your order is on its way!'}
          </p>
          <button 
            onClick={() => navigate('#/')}
            className="w-full bg-brown text-white py-3 rounded-xl font-bold hover:bg-brown/90 transition-colors"
          >
            Back to Menu
          </button>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <h2 className="text-2xl font-heading font-bold text-brown mb-4">Your cart is empty</h2>
        <button 
          onClick={() => navigate('#/')}
          className="bg-brown text-white px-6 py-2 rounded-xl font-bold hover:bg-brown/90 transition-colors"
        >
          Return to Menu
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-[60px] md:top-[80px] lg:top-[100px] z-30">
        <div className="container mx-auto px-4 h-16 flex items-center">
          <button 
            onClick={() => navigate('#/')}
            className="flex items-center text-brown hover:text-brown/80 font-medium"
          >
            <ArrowLeft className="w-5 h-5 mr-1" /> Back
          </button>
          <h1 className="flex-1 text-center text-xl font-heading font-bold text-brown pr-10">Checkout</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-8">
          
          {/* Form Fields */}
          <div className="md:col-span-7 space-y-8">
            
            {/* Customer Info */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-brown mb-4">Customer Information</h2>
              <div className="space-y-4">
                {(orderType === 'takeaway' || orderType === 'delivery') && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                    <input 
                      type="text" 
                      name="fullName"
                      required 
                      value={formData.fullName}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brown focus:border-brown outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
                  <input 
                    type="tel" 
                    name="phone"
                    required 
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brown focus:border-brown outline-none"
                  />
                </div>
              </div>
            </section>

            {/* Order Type */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-brown mb-4">Order Type</h2>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {['dine-in', 'takeaway', 'delivery'].map((type) => (
                  <label key={type} className={`
                    cursor-pointer text-center py-3 rounded-xl border-2 transition-all
                    ${orderType === type ? 'border-brown bg-brown/5 text-brown font-bold' : 'border-gray-200 text-gray-600 hover:border-gray-300'}
                  `}>
                    <input 
                      type="radio" 
                      name="orderType" 
                      value={type}
                      checked={orderType === type}
                      onChange={(e) => setOrderType(e.target.value)}
                      className="hidden" 
                    />
                    {type.charAt(0).toUpperCase() + type.slice(1).replace('-', ' ')}
                  </label>
                ))}
              </div>

              {/* Dynamic Fields based on Order Type */}
              <div className="space-y-4">
                {orderType === 'dine-in' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Table Number *</label>
                    <input 
                      type="text" 
                      name="tableNumber"
                      required 
                      value={formData.tableNumber}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brown focus:border-brown outline-none"
                    />
                  </div>
                )}

                {orderType === 'takeaway' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Pickup Time (optional)</label>
                    <input 
                      type="time" 
                      name="pickupTime"
                      value={formData.pickupTime}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brown focus:border-brown outline-none"
                    />
                  </div>
                )}

                {orderType === 'delivery' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address *</label>
                      <textarea 
                        name="address"
                        required 
                        rows="2"
                        value={formData.address}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brown focus:border-brown outline-none"
                      ></textarea>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Landmark (optional)</label>
                      <input 
                        type="text" 
                        name="landmark"
                        value={formData.landmark}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brown focus:border-brown outline-none"
                      />
                    </div>
                  </>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Special Instructions (optional)</label>
                  <textarea 
                    name="notes"
                    rows="2"
                    value={formData.notes}
                    onChange={handleInputChange}
                    placeholder="E.g., no sugar, extra ice..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brown focus:border-brown outline-none"
                  ></textarea>
                </div>
              </div>
            </section>

            {/* Payment Method */}
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h2 className="text-lg font-bold text-brown mb-4">Payment Method</h2>
              <div className="grid grid-cols-2 gap-3">
                {['cash', 'zaad', 'evc-plus', 'edahab'].map((method) => (
                  <label key={method} className={`
                    cursor-pointer flex items-center p-3 rounded-xl border-2 transition-all
                    ${paymentMethod === method ? 'border-brown bg-brown/5 text-brown font-bold' : 'border-gray-200 text-gray-600 hover:border-gray-300'}
                  `}>
                    <input 
                      type="radio" 
                      name="paymentMethod" 
                      value={method}
                      checked={paymentMethod === method}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="mr-3 accent-brown" 
                    />
                    {method.toUpperCase().replace('-', ' ')}
                  </label>
                ))}
              </div>
            </section>
          </div>

          {/* Order Summary */}
          <div className="md:col-span-5">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 sticky top-40">
              <h2 className="text-lg font-bold text-brown mb-4 border-b pb-4">Order Summary</h2>
              
              <div className="space-y-4 mb-6 max-h-60 overflow-y-auto pr-2">
                {cartItems.map(item => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      <span className="font-medium mr-2">{item.quantity}x</span> 
                      {item.title}
                    </span>
                    <span className="font-medium text-gray-800">
                      ${((item.price * item.quantity) / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              
              <div className="border-t pt-4 space-y-2 mb-6">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>${(subtotalCents / 100).toFixed(2)}</span>
                </div>
                {orderType === 'delivery' && (
                  <div className="flex justify-between text-gray-600">
                    <span>Delivery Fee</span>
                    <span>${(deliveryFeeCents / 100).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xl font-bold text-brown pt-2 border-t mt-2">
                  <span>Total</span>
                  <span>${(totalCents / 100).toFixed(2)}</span>
                </div>
              </div>

              {apiError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  ⚠️ {apiError}
                </div>
              )}
              <button 
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-brown text-white py-4 rounded-xl font-bold text-lg hover:bg-brown/90 transition-colors shadow-lg shadow-brown/30 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Placing Order...' : 'Place Order'}
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
