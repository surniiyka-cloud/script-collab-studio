import { useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Check, Clapperboard, Layers, LockKeyhole, PenLine, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { ApiError } from '../api';

export function AuthScreen({ mode }: { mode: 'login' | 'register' }) {
  const isNew = mode === 'register';
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (isNew) await register(email.trim(), password, name.trim());
      else await login(email.trim(), password);
      navigate('/projects', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.code === 'INVALID_CREDENTIALS' ? 'Неверная почта или пароль.'
          : err.code === 'CONFLICT' ? 'Аккаунт с такой почтой уже существует.' : err.message);
      } else { setError('Не удалось выполнить вход. Попробуйте ещё раз.'); }
    } finally { setBusy(false); }
  }
  return <div className="auth-page">
    <section className="auth-hero" aria-label="О платформе">
      <div className="auth-hero-logo"><span className="brand-symbol"><Clapperboard size={23}/></span>
        <span className="brand-text"><strong>script<span>studio</span></strong><small>COLLABORATIVE WORKSPACE</small></span></div>
      <div className="auth-orbit auth-orbit-one"/><div className="auth-orbit auth-orbit-two"/>
      <div className="hero-content"><span className="eyebrow"><Sparkles size={13}/> ПРОСТРАНСТВО ДЛЯ ИСТОРИЙ</span>
        <h1>От первой<br/>идеи — <em>до кадра.</em></h1>
        <p>Пишите сценарии, выстраивайте сцены и собирайте команду вокруг одной истории.</p>
        <div className="hero-line"/>
        <div className="hero-benefits">
          <span><PenLine size={17}/> Сценарии и сцены</span>
          <span><Layers size={17}/> Раскадровки и связи</span>
          <span><Check size={17}/> Работа над проектом вместе</span>
        </div>
      </div>
      <div className="auth-hero-footer"><span>Слова. Сцены. Истории.</span><span>STUDIO / 01</span></div>
    </section>
    <section className="auth-form-wrap">
      <div className="auth-topnote"><span className="status-dot"/> Ваше творческое пространство</div>
      <div className="auth-form-card">
        <div className="auth-heading">
          <div className="tiny-chip"><LockKeyhole size={14}/> Личный кабинет</div>
          <h2>{isNew ? 'Создайте аккаунт' : 'С возвращением!'}</h2>
          <p>{isNew ? 'Заведите аккаунт, чтобы начать свой первый проект.' : 'Продолжим с того места, где остановились?'}</p>
        </div>
        <form onSubmit={submit}>
          {isNew && <div className="form-field"><label htmlFor="display-name">Как вас зовут</label>
            <input id="display-name" className="field-input" autoComplete="name" maxLength={200} required placeholder="Имя или псевдоним" value={name} onChange={e=>setName(e.target.value)}/></div>}
          <div className="form-field"><label htmlFor="email">Электронная почта</label>
            <input id="email" className="field-input" type="email" autoComplete="email" required placeholder="name@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></div>
          <div className="form-field"><label htmlFor="password">Пароль</label>
            <input id="password" className="field-input" type="password" autoComplete={isNew ? 'new-password' : 'current-password'} required minLength={isNew ? 10 : undefined} maxLength={128} placeholder={isNew ? 'Не менее 10 символов' : 'Введите пароль'} value={password} onChange={e=>setPassword(e.target.value)}/></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Проверяем…' : isNew ? 'Создать аккаунт' : 'Войти в студию'} <ArrowRight size={17}/></button>
        </form>
        <p className="auth-switch">{isNew ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'}{' '}
          <Link to={isNew ? '/login' : '/register'}>{isNew ? 'Войти' : 'Зарегистрироваться'}</Link></p>
      </div>
      <div className="auth-footnote">Script Collab Studio · Версия для разработки</div>
    </section>
  </div>;
}
