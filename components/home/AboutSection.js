export default function AboutSection() {
  return (
    <section id="about" className="py-20 bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h3 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            About CoLive
          </h3>
          <p className="text-gray-600 text-lg max-w-3xl mx-auto">
            We&apos;re on a mission to make collaboration simple, secure, and accessible to everyone around the world.
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 gap-12 items-center max-w-4xl mx-auto">
          <div>
            <h4 className="text-2xl font-semibold text-gray-900 mb-4">Our Mission</h4>
            <p className="text-gray-600 leading-relaxed">
              We believe that great things happen when people work together. CoLive was built to break down barriers and make collaboration seamless for teams of all sizes.
            </p>
          </div>
          <div>
            <h4 className="text-2xl font-semibold text-gray-900 mb-4">Our Vision</h4>
            <p className="text-gray-600 leading-relaxed">
              To create a world where distance is no longer a barrier to effective teamwork. We envision a future where every team can collaborate effortlessly.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}