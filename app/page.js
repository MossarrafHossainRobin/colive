import Navbar from '@/components/Navbar';
import HeroSection from '@/components/home/HeroSection';
import MealJourney from '@/components/home/MealJourney';
import Footer from '@/components/home/Footer';
import GoogleOneTap from '@/components/home/GoogleOneTap';
import HomeMaintenanceGate from '@/components/home/HomeMaintenanceGate';

export default function Home() {
  return (
    <HomeMaintenanceGate>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <Navbar />
        <GoogleOneTap />
        <HeroSection />
        <MealJourney />
        <Footer />
      </div>
    </HomeMaintenanceGate>
  );
}
