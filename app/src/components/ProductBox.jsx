import React, { useState } from 'react'
import { Plus } from './Icons'
import { useCart } from '../context/CartContext'

export default function ProductBox({ product }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const { addToCart } = useCart()

  return (
    <div className="group border-2 border-cream rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.25)] hover:border-brown transition-all duration-300 flex flex-col h-full bg-white">
      <div className="relative aspect-[21/9] overflow-hidden rounded-t-lg bg-cream">
        <img 
          src={product.image} 
          alt={product.title}
          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${
            imageLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setImageLoaded(true)}
          loading="lazy"
        />
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-brown/30 border-t-brown rounded-full animate-spin"></div>
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="text-lg font-heading font-semibold text-brown mb-2">{product.title}</h3>
        <p className="text-sm font-body text-gray-600 mb-4 line-clamp-2 flex-1">{product.description}</p>
        <div className="flex justify-between items-center mt-auto">
          <div className="flex flex-col">
            <span className="text-xs font-body text-gray-500 mb-1">{product.category}</span>
            <span className="text-brown font-body font-bold text-lg">{product.price}</span>
          </div>
          <button 
            onClick={() => addToCart(product)}
            className="flex items-center justify-center bg-cream hover:bg-brown hover:text-cream text-brown p-3 rounded-full transition-colors"
            title="Add to Cart"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}


