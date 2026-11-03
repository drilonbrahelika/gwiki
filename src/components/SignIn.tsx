import { useEffect, useState } from 'react';
import { AuthError, loadGis, signIn } from '../google/auth';
import { useConfig, useT } from '../lib/data';
import { format } from '../messages';
import { GoogleIcon } from './icons';
import { BrandMark } from './ui';

export function SignIn() {
  const { appName, logoUrl, googleClientId, allowedDomain, supportUrl, messages, editing } = useConfig();
  const t = useT();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [bodyBefore, bodyAfter = ''] = format(messages.signInBody, { appName }).split('{account}');

  const fail = (e: unknown) => setError(t(e instanceof AuthError ? e.code : 'authProfile', { domain: allowedDomain ?? '' }));

  useEffect(() => {
    loadGis().then(() => setReady(true), fail);
    // Runs once: the script loads for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onClick = () => {
    setBusy(true);
    setError(undefined);
    // Synchronous from the click, so the browser allows Google's popup.
    signIn(googleClientId, allowedDomain, editing)
      .catch(fail)
      .finally(() => setBusy(false));
  };

  return (
    <main className="signin">
      <div className="signin-card">
        <div className="brand">
          <BrandMark name={appName} logoUrl={logoUrl} />
          {!logoUrl && <span className="brand-name">{appName}</span>}
        </div>
        <div>
          <h1>{t('signInTitle', { appName })}</h1>
          <p>
            {bodyBefore}
            <strong>{allowedDomain ?? t('signInAnyAccount')}</strong>
            {bodyAfter}
          </p>
        </div>
        <button type="button" className="button button-primary button-large" onClick={onClick} disabled={!ready || busy}>
          <GoogleIcon /> {t('signInButton')}
        </button>
        {error && <div className="alert" role="alert">{error}</div>}
        <p className="signin-note">{t(editing ? 'signInNoteEditing' : 'signInNote')}</p>
        {supportUrl && <a className="signin-help" href={supportUrl} target="_blank" rel="noopener noreferrer">{t('signInHelp')}</a>}
      </div>
    </main>
  );
}
