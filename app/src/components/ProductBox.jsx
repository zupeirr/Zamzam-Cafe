import React, { useState } from 'react'
import { Plus } from './Icons'
import { useCart } from '../context/CartContext'

export default function ProductBox({ product }) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const [hasImageError, setHasImageError] = useState(false)
  const { addToCart } = useCart()

  return (
    <div className="group border-2 border-cream rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.15)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.25)] hover:border-brown transition-all duration-300 flex flex-col h-full bg-white">
      <div className="relative aspect-[21/9] overflow-hidden rounded-t-lg bg-cream flex items-center justify-center">
        {hasImageError || !product.image ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-cream text-brown/65 p-2 select-none">
            <svg className="w-7 h-7 mb-1 opacity-75" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15a4.5 4.5 0 0 0 4.5 4.5H18a3.75 3.75 0 0 0 1.35-7.24 10.5 10.5 0 0 0-16.59-3.41m0 0A5 5 0 0 1 12 5.25a5 5 0 0 1 7.14 7.3a1.5 1.5 0 0 0-2.91.56A1.5 1.5 0 0 0 17.25 15" />
            </svg>
            <span className="text-xs font-body font-medium">No Image Available</span>
          </div>
        ) : (
          <img 
            src={product.image} 
            alt={product.title}
            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${
              imageLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            onLoad={() => setImageLoaded(true)}
            onError={() => {
              setHasImageError(true);
              setImageLoaded(true);
            }}
            loading="lazy"
          />
        )}
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
            <span className="text-xs font-body text-gray-500 mb-1">{product.categoryId}</span>
            <span className="text-brown font-body font-bold text-lg">${(product.price / 100).toFixed(2)}</span>
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


