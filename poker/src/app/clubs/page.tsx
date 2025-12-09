'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { isClubOwnerOrAdmin } from '~/lib/permissions';
import type { Club, ClubMember, User } from '~/lib/types';

export default function ClubsPage() {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [memberships, setMemberships] = useState<Record<string, ClubMember>>({});
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Seed clubs if needed (idempotent)
      await fetch('/api/clubs', { method: 'POST' });

      // Fetch clubs
      const clubsRes = await fetch('/api/clubs');
      if (!clubsRes.ok) throw new Error('Failed to fetch clubs');
      const clubsData = await clubsRes.json();
      setClubs(clubsData.data || []);

      // Try to get current user from session/storage (simplified for MVP)
      // In production, this would come from auth context
      const userFid = localStorage.getItem('userFid');
      if (userFid) {
        const userRes = await fetch(`/api/users?fid=${userFid}`);
        if (userRes.ok) {
          const userData = await userRes.json();
          const user = userData.data;
          setCurrentUser(user);

          // Fetch memberships for all clubs
          const membershipMap: Record<string, ClubMember> = {};
          for (const club of clubsData.data || []) {
            const membersRes = await fetch(`/api/clubs/${club.id}/members`);
            if (membersRes.ok) {
              const membersData = await membersRes.json();
              const userMembership = membersData.data?.find((m: ClubMember) => 
                user && m.member_fid === user.fid
              );
              if (userMembership) {
                membershipMap[club.id] = userMembership;
              }
            }
          }
          setMemberships(membershipMap);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load clubs');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Loading clubs...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen p-8 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-600">Error: {error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-4">Poker Clubs</h1>
        <div className="space-y-4 mt-8">
          {clubs.map((club) => {
            const membership = memberships[club.id];
            const isOwner = currentUser && isClubOwnerOrAdmin(currentUser.fid, club);
            const isMember = !!membership;

            return (
              <div
                key={club.id}
                className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold mb-2">{club.name}</h2>
                    {club.description && (
                      <p className="text-gray-600 mb-4">{club.description}</p>
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
                  <div className="mt-4 flex gap-4">
                    <Link
                      href={`/clubs/${club.slug}/games`}
                      className="inline-block px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark font-medium"
                    >
                      View Games →
                    </Link>
                    <Link
                      href={`/clubs/${club.slug}/announcements`}
                      className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                    >
                      Announcements →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
