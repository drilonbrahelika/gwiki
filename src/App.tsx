import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { AppConfig } from './config';
import { GlobalNav, Sidebar } from './components/Layout';
import { Palette } from './components/Palette';
import { CreateContext, CreateDialog, useCanCreate, type CreateRequest } from './components/Create';
import { ShortcutsDialog, useShortcuts } from './components/Shortcuts';
import { SignIn } from './components/SignIn';
import { HomeView, ItemView, StarredView } from './components/Views';
import { ConfigContext, createQueryClient, useFile, useSession } from './lib/data';
import { MIME } from './google/drive';
import { useRoute } from './lib/route';
import { clearVisits } from './lib/history';

function Shell() {
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  // Open search, optionally scoped to one space; `null` while closed.
  const [search, setSearch] = useState<{ scopeId?: string } | null>(null);
  const [creating, setCreating] = useState<CreateRequest | null>(null);
  const location = `${route.id}|${route.view}`;
  const [lastLocation, setLastLocation] = useState(location);
  const current = useFile(route.id ?? '');
  const activeFolderId = route.id && current.data && (current.data.mimeType === MIME.folder ? current.data.id : current.data.parents?.[0]);

  // On small screens the menu is an overlay; close it once the user has navigated.
  if (location !== lastLocation) {
    setLastLocation(location);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }

  const [help, setHelp] = useState(false);
  const canCreate = useCanCreate();
  const folderId = activeFolderId || undefined;
  useShortcuts({
    search: () => setSearch({}),
    help: () => setHelp(true),
    newPage: canCreate && folderId ? () => setCreating({ parent: { id: folderId, name: current.data?.mimeType === MIME.folder ? current.data.name : undefined }, kind: 'page' }) : undefined,
  });

  return (
    <CreateContext.Provider value={setCreating}>
      <div className="shell">
        <GlobalNav onMenu={() => setMenuOpen(open => !open)} onSearch={() => setSearch({})} onShortcuts={() => setHelp(true)} />
        <div className="body">
          <Sidebar open={menuOpen} activeFolderId={activeFolderId || undefined} onSearch={scopeId => setSearch({ scopeId })} onShortcuts={() => setHelp(true)} />
          <main className="main" onClick={() => menuOpen && setMenuOpen(false)}>
            {route.view === 'starred' ? <StarredView /> : route.id ? <ItemView key={route.id} id={route.id} /> : <HomeView onSearch={() => setSearch({})} />}
          </main>
        </div>
        {search && <Palette scopeId={search.scopeId} onClose={() => setSearch(null)} />}
        {creating && <CreateDialog {...creating} onClose={() => setCreating(null)} />}
        {help && <ShortcutsDialog onClose={() => setHelp(false)} />}
      </div>
    </CreateContext.Provider>
  );
}

export function App({ config }: { config: AppConfig }) {
  const [queryClient] = useState(createQueryClient);
  const session = useSession();

  // Nothing fetched for one account may be shown to the next.
  useEffect(() => {
    if (!session) {
      queryClient.clear();
      clearVisits();
    }
  }, [session, queryClient]);

  return (
    <ConfigContext.Provider value={config}>
      <QueryClientProvider client={queryClient}>{session ? <Shell /> : <SignIn />}</QueryClientProvider>
    </ConfigContext.Provider>
  );
}
