"use client"

import { createContext, useContext, useState, useEffect } from "react"

type Density = "sparse" | "normal" | "dense"

interface DensityContextValue {
  density: Density
  setDensity: (d: Density) => void
}

const DensityContext = createContext<DensityContextValue>({
  density: "normal",
  setDensity: () => {},
})

export function DensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensity] = useState<Density>("normal")

  useEffect(() => {
    document.body.setAttribute("data-density", density)
  }, [density])

  return (
    <DensityContext.Provider value={{ density, setDensity }}>
      {children}
    </DensityContext.Provider>
  )
}

export function useDensity() {
  return useContext(DensityContext)
}
