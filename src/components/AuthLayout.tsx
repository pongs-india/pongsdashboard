import type { ReactNode } from 'react'

// Split-screen frame for the signed-out pages. The photo panel is decorative
// and hidden on small screens.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] bg-white">
      <div className="flex flex-col px-6 py-8 sm:px-12 lg:px-16">
        <a href="/login" className="inline-flex w-fit" aria-label="Pongs India">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pongs-logo.png" alt="Pongs India" width={96} height={40} className="h-10 w-auto" />
        </a>
        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-[380px] mx-auto lg:mx-0 lg:ml-[8%]">{children}</div>
        </div>
        <p className="text-xs text-gray-500">© Pongs India · Next Level Solutions, Bengaluru</p>
      </div>

      <div
        aria-hidden
        className="relative hidden lg:block bg-[#2a241e] bg-no-repeat"
        style={{ backgroundImage: 'url(/cover-bg.jpg)', backgroundSize: '130%', backgroundPosition: '50% 60%' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/20" />
        <div className="absolute inset-x-0 bottom-0 p-12 text-white">
          <p className="text-[22px] font-semibold leading-snug tracking-tight max-w-md">
            Stretch ceilings and integrated lighting, from first quote to final install.
          </p>
          <p className="mt-3 text-sm text-white/70 max-w-md">
            Quotations, projects, inventory and clients in one workspace for the Pongs team.
          </p>
        </div>
      </div>
    </div>
  )
}
