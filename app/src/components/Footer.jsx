import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-brown text-cream border-t border-cream/20 mt-auto">
      {/* Main Content Area */}
      <div className="container mx-auto px-6 py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16">
          {/* Column 1: Brand Info */}
          <div className="flex flex-col space-y-4">
            <h3 className="text-xl font-heading font-bold tracking-wide">Aura Coffee</h3>
            <p className="font-body text-sm text-cream/80 leading-relaxed max-w-sm">
              Crafting premium coffee experiences since 2024. Stop by to enjoy the finest organic beans, hand-crafted pastries, and a warm, inviting workspace.
            </p>
            <div className="pt-2">
              <span className="font-heading font-semibold text-xs uppercase tracking-wider block text-cream/60">Opening Hours</span>
              <span className="font-body text-sm mt-1 block">Mon - Sun: 7:00 AM - 11:00 PM</span>
            </div>
          </div>

          {/* Column 2: Navigation Links */}
          <div className="flex flex-col space-y-4">
            <h4 className="text-lg font-heading font-semibold tracking-wide">Quick Links</h4>
            <ul className="font-body text-sm space-y-3">
              <li>
                <a href="#/" className="hover:text-orange transition-colors duration-300">
                  Our Menu
                </a>
              </li>
              <li>
                <a href="#/checkout" className="hover:text-orange transition-colors duration-300">
                  Checkout
                </a>
              </li>
              <li>
                <a href="#/about" className="hover:text-orange transition-colors duration-300">
                  About Us
                </a>
              </li>
            </ul>
          </div>

          {/* Column 3: Contact & Support */}
          <div className="flex flex-col space-y-4">
            <h4 className="text-lg font-heading font-semibold tracking-wide">Contact Us</h4>
            <ul className="font-body text-sm space-y-3 text-cream/95">
              <li className="flex items-center space-x-2">
                <span>📍</span>
                <span>123 Coffee Lane, Brewtown, BT 94016</span>
              </li>
              <li className="flex items-center space-x-2">
                <span>📞</span>
                <span>+1 (555) 123-4567</span>
              </li>
              <li className="flex items-center space-x-2">
                <span>✉️</span>
                <span>hello@auracoffee.com</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="bg-brown/80 border-t border-cream/10 py-6">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          <p className="font-body text-xs text-cream/70 text-center md:text-left">
            © {new Date().getFullYear()} Aura Coffee. All rights reserved.
          </p>
          <div className="flex space-x-6 text-cream/70 text-xs font-body">
            <a href="#/privacy" className="hover:text-orange transition-colors duration-200">Privacy Policy</a>
            <a href="#/terms" className="hover:text-orange transition-colors duration-200">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
