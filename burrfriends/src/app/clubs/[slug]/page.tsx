'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useAuth } from '~/components/AuthProvider';
import { authedFetch } from '~/lib/authedFetch';
import { isClubOwnerOrAdmin } from '~/lib/permissions';
import { HELLFIRE_CLUB_SLUG } from '~/lib/constants';
import type { Club, ClubMember, User } from '~/lib/types';

export default function ClubPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { token, fid } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [membership, setMembership] = useState<ClubMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) {
      loadData();
    } else if (!token && fid === null) {
      setError('Please sign in');
      setLoading(false);
    }
  }, [slug, token, fid]);

  const loadData = async () => {
    if (!token) {
      setError('Please sign in');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      // MVP-only: Only SIAs Poker Room is supported (with fallback to old slug during migration)
      const { HELLFIRE_CLUB_SLUG } = await import('~/lib/constants');
      const validSlugs = [HELLFIRE_CLUB_SLUG, 'hellfire']; // Support both during migration
      if (!validSlugs.includes(slug)) {
        setError(`Only ${HELLFIRE_CLUB_SLUG} club is supported in MVP`);
        return;
      }
      
      // Fetch club (requires auth) - API will handle fallback
      const clubsRes = await authedFetch('/api/clubs', { method: 'GET' }, token);
      if (!clubsRes.ok) throw new Error('Failed to fetch clubs');
      const clubsData = await clubsRes.json();
      const foundClub = clubsData.data?.[0]; // Should be SIAs Poker Room or fallback to hellfire
      
      if (!foundClub) {
        setError('Club not found');
        return;
      }
      
      // Accept either slug during migration
      if (!validSlugs.includes(foundClub.slug)) {
        setError('Club not found');
        return;
      }
      setClub(foundClub);

      // Get current user from auth context
      if (fid) {
        const userRes = await authedFetch(`/api/users?fid=${fid}`, { method: 'GET' }, token);
        if (userRes.ok) {
          const userData = await userRes.json();
          const user = userData.data;
          setCurrentUser(user);

          // Fetch membership (requires auth)
          const membersRes = await authedFetch(`/api/clubs/${foundClub.id}/members`, { method: 'GET' }, token);
          if (membersRes.ok) {
            const membersData = await membersRes.json();
            const userMembership = membersData.data?.find((m: ClubMember) => 
              m.member_fid === user.fid
            );
            if (userMembership) {
              setMembership(userMembership);
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load club');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Loading club...</p>
        </div>
      </main>
    );
  }

  if (error || !club) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <Link href="/clubs" className="text-primary hover:underline mb-4 inline-block">
            ← Back to Clubs
          </Link>
          <p className="text-red-600">Error: {error || 'Club not found'}</p>
        </div>
      </main>
    );
  }

  const isOwner = currentUser && isClubOwnerOrAdmin(currentUser.fid, club);
  const isMember = !!membership;

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <Link href="/clubs" className="text-primary hover:underline mb-4 inline-block">
          ← Back to Clubs
        </Link>

        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-4xl font-bold mb-2">{club.name}</h1>
              {club.description && (
                <p className="text-gray-600 text-lg mb-4">{club.description}</p>
              )}
              <div className="flex gap-2">
                {isOwner && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
                    Owner
                  </span>
                )}
                {isMember && !isOwner && (
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                    Member
                  </span>
                )}
                {!isMember && !isOwner && (
                  <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm font-medium">
                    Not Joined
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href={`/clubs/${HELLFIRE_CLUB_SLUG}/games`}
              className="p-6 bg-primary text-white rounded-lg hover:bg-primary-dark font-medium text-center transition-colors"
            >
              <h2 className="text-xl font-semibold mb-2">View Games</h2>
              <p className="text-sm opacity-90">Browse and join poker games</p>
            </Link>

            <Link
              href={`/clubs/${HELLFIRE_CLUB_SLUG}/announcements`}
              className="p-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-center transition-colors"
            >
              <h2 className="text-xl font-semibold mb-2">Announcements</h2>
              <p className="text-sm opacity-90">View club updates and news</p>
            </Link>

            {isOwner && (
              <Link
                href={`/clubs/${HELLFIRE_CLUB_SLUG}/games/new`}
                className="p-6 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-center transition-colors"
              >
                <h2 className="text-xl font-semibold mb-2">Create Game</h2>
                <p className="text-sm opacity-90">Schedule a new poker game</p>
              </Link>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

