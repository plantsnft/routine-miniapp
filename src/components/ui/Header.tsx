"use client";

import { useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import { useMiniApp } from "@neynar/react";

type HeaderProps = {
  neynarUser?: {
    fid: number;
    score: number;
  } | null;
};

export function Header({ neynarUser }: HeaderProps) {
  const { context } = useMiniApp();
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  return (
    <div className="relative">
      <div 
        className="mt-4 mb-0 mx-4 px-4 py-3 bg-black rounded-lg flex items-center justify-between border-2 border-[#c1b400]"
        style={{ background: "#000000", borderColor: "#c1b400" }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <a
            href="https://farcaster.xyz/~/channel/catwalk"
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-bold"
            style={{ 
              color: "#c1b400", 
              textDecoration: "none",
              cursor: "pointer",
              marginBottom: 4,
            }}
          >
            Welcome to /Catwalk
          </a>
          <p style={{ 
            margin: 0, 
            fontSize: 12, 
            color: "#ffffff", 
            opacity: 0.8,
            fontWeight: 400,
          }}>
            World&apos;s First Entertainment Brand Coin
          </p>
        </div>
        {context?.user && (
          <div 
            className="cursor-pointer"
            onClick={() => {
              setIsUserDropdownOpen(!isUserDropdownOpen);
            }}
          >
            {context.user.pfpUrl && (
              <img 
                src={context.user.pfpUrl} 
                alt="Profile" 
                className="w-10 h-10 rounded-full border-2"
                style={{ borderColor: "#c1b400" }}
              />
            )}
          </div>
        )}
      </div>
      {context?.user && (
        <>      
          {isUserDropdownOpen && (
            <div 
              className="absolute top-full right-0 z-50 w-fit mt-1 mx-4 rounded-lg shadow-lg"
              style={{ background: "#c1b400", border: "2px solid #000000" }}
            >
              <div className="p-3 space-y-2">
                <div className="text-right">
                  <h3 
                    className="font-bold text-sm hover:underline cursor-pointer inline-block"
                    style={{ color: "#000000" }}
                    onClick={() => sdk.actions.viewProfile({ fid: context.user.fid })}
                  >
                    {context.user.displayName || context.user.username}
                  </h3>
                  <p className="text-xs" style={{ color: "#000000", opacity: 0.8 }}>
                    @{context.user.username}
                  </p>
                  <p className="text-xs" style={{ color: "#000000", opacity: 0.7 }}>
                    FID: {context.user.fid}
                  </p>
                  {neynarUser && (
                    <>
                      <p className="text-xs" style={{ color: "#000000", opacity: 0.7 }}>
                        Neynar Score: {neynarUser.score}
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
