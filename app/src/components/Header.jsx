import React from 'react'
import logo from '../../public/logos/Logo.svg'
import pattern from '../../public/Patern/CoffeeArt.svg'
import { ShoppingCart } from './Icons'
import { useCart } from '../context/CartContext'

export default function Header({ onCartClick, navigate, currentRoute }) {
  const { getCartCount } = useCart();

  return (
    <div className='fixed top-0 left-0 right-0 w-full h-[60px] md:h-[80px] lg:h-[100px] bg-brown text-cream flex items-center justify-between px-6 md:px-12 lg:px-[70px] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.15)] z-40'>
        <div 
          className='min-w-[140px] md:min-w-[160px] lg:min-w-[200px] flex items-center cursor-pointer'
          onClick={() => navigate('#/')}
        >
            <img src={logo} alt="logo" className='w-8 h-8 md:w-9 lg:w-10 md:h-9 lg:h-10 mr-2' />
            <h1 className='text-lg md:text-xl lg:text-2xl font-bold font-heading whitespace-nowrap'>Aura Coffee</h1>
        </div>
        <div className='hidden md:flex flex-1 items-center justify-center'>
            <img 
                src={pattern} 
                alt="coffee bean" 
                className='coffee-bean w-[250px] md:w-[300px] lg:w-[400px] h-[120px] md:h-[150px] lg:h-[200px]' 
            />
        </div>
        <div className='min-w-[140px] md:min-w-[160px] lg:min-w-[200px] flex items-center justify-end gap-4'>
          {currentRoute !== '#/checkout' && (
            <button 
              onClick={onCartClick}
              className="relative p-2 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
            >
              <ShoppingCart className="w-6 h-6" />
              {getCartCount() > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center transform translate-x-1 -translate-y-1">
                  {getCartCount()}
                </span>
              )}
            </button>
          )}
        </div>
    </div>
  )
}

