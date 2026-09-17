/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		fontFamily: {
  			inter: ['var(--font-inter)']
  		},
  		fontSize: {
  			page: ['24px', { lineHeight: '30px', fontWeight: '800', letterSpacing: '-0.02em' }],
  			kpi: ['24px', { lineHeight: '30px', fontWeight: '700', letterSpacing: '-0.01em' }],
  			object: ['17px', { lineHeight: '24px', fontWeight: '500' }],
  			value: ['15px', { lineHeight: '22px', fontWeight: '600' }],
  			body: ['14px', { lineHeight: '21px' }],
  			meta: ['13px', { lineHeight: '19px' }],
  			label: ['12px', { lineHeight: '16px', fontWeight: '500', letterSpacing: '0.04em' }],
  			section: ['11px', { lineHeight: '16px', fontWeight: '600', letterSpacing: '0.14em' }]
  		},
  		borderRadius: {
  			xl: 'var(--radius)',
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			canvas: 'hsl(var(--canvas))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			status: {
  				neutral: 'hsl(var(--status-neutral))',
  				attention: 'hsl(var(--status-attention))',
  				'attention-surface': 'hsl(var(--status-attention-surface))',
  				critical: 'hsl(var(--status-critical))',
  				'critical-surface': 'hsl(var(--status-critical-surface))',
  				info: 'hsl(var(--status-info))',
  				'info-surface': 'hsl(var(--status-info-surface))',
  				done: 'hsl(var(--status-done))',
  				'done-text': 'hsl(var(--status-done-text))',
  				'done-surface': 'hsl(var(--status-done-surface))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}