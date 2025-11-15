
import type { AppProps } from 'next/app'
import Head from 'next/head'
import '../styles/globals.css'

// Add ethereum to window type
declare global {
  interface Window {
    ethereum?: any
  }
}

export default function App({Component,pageProps}:AppProps){
  return (<>
    <Head><title>FLIP ROYALE — New</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
    <Component {...pageProps} />
  </>)
}
