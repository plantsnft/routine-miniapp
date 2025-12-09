import Link from 'next/link';
import { SignInButton } from '~/components/SignInButton';

export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">Poker Mini App</h1>
        <p className="text-lg text-gray-600 mb-8">
          Farcaster Mini App for managing ClubGG poker games for Hellfire Club and Burrfriends
        </p>
        <SignInButton />
        <div className="mt-8">
          <Link 
            href="/clubs" 
            className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark"
          >
            View Clubs →
          </Link>
        </div>
      </div>
    </main>
  );
}
