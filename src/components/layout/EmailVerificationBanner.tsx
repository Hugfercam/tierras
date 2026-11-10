import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { ApiError, resendVerification } from '../../lib/api';
import { Icon } from '../ui/Icons';

export function EmailVerificationBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);

  if (!user || user.emailVerified !== false) return null;

  const resend = async () => {
    setSending(true);
    try {
      await resendVerification();
      toast('Te enviamos un enlace nuevo. Revisa tu email.', 'success');
    } catch (caught) {
      toast(
        caught instanceof ApiError ? caught.message : 'No pudimos reenviar el email.',
        'error',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="email-verify-banner" role="status">
      <Icon name="mail" size={17} />
      <span>
        <strong>Verifica tu email.</strong> Así protegemos tu cuenta y podremos recuperarla.
      </span>
      <button type="button" onClick={resend} disabled={sending}>
        {sending ? 'Enviando…' : 'Reenviar enlace'}
      </button>
    </div>
  );
}
