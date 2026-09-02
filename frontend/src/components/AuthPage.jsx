import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { GoogleOAuthProvider, GoogleLogin, useGoogleOneTapLogin } from '@react-oauth/google';

const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const googleClientId = '546847428748-bv1dpfra1bcb2hhu8cu0u306k8fh0lvs.apps.googleusercontent.com';

const AuthContent = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotStep, setForgotStep] = useState(1);

  const navigate = useNavigate();
  const { login } = useAuth();
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    const endpoint = isLogin ? '/api/login' : '/api/register';
    const payload = isLogin ? { email, password } : { email, username, password };

    try {
      const response = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.blockedUntil) {
          throw new Error(`Blocked until ${new Date(data.blockedUntil).toLocaleString()}`);
        }
        throw new Error(data.error || 'Server error. Please try again.');
      }

      login(data.token, { username: data.username, role: data.role });
      navigate('/');
    } catch (err) {
      setError(err.message === 'Failed to fetch' ? 'Server error. Please try again.' : err.message);
    }
  };

  const [googleRegData, setGoogleRegData] = useState(null);

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const response = await fetch(`${backendUrl}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: credentialResponse.credential })
      });
      const data = await response.json();
      
      if (!response.ok) {
        if (data.blockedUntil) {
          throw new Error(`Blocked until ${new Date(data.blockedUntil).toLocaleString()}`);
        }
        throw new Error(data.error);
      }

      if (data.requiresRegistration) {
        setGoogleRegData(data);
        setUsername(data.baseUsername);
        setPassword('');
      } else {
        login(data.token, { username: data.username, role: data.role });
        navigate('/');
      }
    } catch(err) {
      setError('Google auth failed: ' + err.message);
    }
  };

  // The actual One Tap hook that shows the popup in the top right
  // useGoogleOneTapLogin({
  //   onSuccess: handleGoogleSuccess,
  //   onError: () => console.log('Google One Tap failed or closed'),
  // });

  const handleGoogleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const regRes = await fetch(`${backendUrl}/api/auth/google-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleToken: googleRegData.googleToken, username, password })
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error);
      
      login(regData.token, { username: regData.username, role: regData.role });
      navigate('/');
    } catch(err) {
      setError('Google registration failed: ' + err.message);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (forgotStep === 1) {
        const res = await fetch(`${backendUrl}/api/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: forgotEmail })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setForgotStep(2);
      } else {
        const res = await fetch(`${backendUrl}/api/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: forgotEmail, code: resetCode, newPassword })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showToast('Password reset successfully!');
        setShowForgot(false);
        setForgotStep(1);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="auth-navbar">
        <h2>Coll-Connect</h2>
      </div>

      <div className="auth-main-container">
        <div className="auth-card">
          {googleRegData ? (
            <>
              <h2>Complete Registration</h2>
              <p>Welcome {googleRegData.email}! Please pick a username and password.</p>
              <form onSubmit={handleGoogleRegisterSubmit} className="auth-form">
                <div className="form-group">
                  <label>Username</label>
                  <input
                    type="text"
                    className="auth-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="auth-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>
                {error && <div className="error-text">{error}</div>}
                <button type="submit" className="btn-gradient">
                  COMPLETE SIGN UP
                </button>
                <button type="button" className="btn-text-only" onClick={() => { setGoogleRegData(null); setError(''); }}>Cancel</button>
              </form>
            </>
          ) : showForgot ? (
            <>
              <h2>Reset Password</h2>
              <p>Follow the steps to recover your account.</p>
              <form onSubmit={handleForgotSubmit} className="auth-form">
                {forgotStep === 1 ? (
                  <div className="form-group">
                    <label>Email</label>
                    <input type="email" className="auth-input" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Reset Code</label>
                      <input type="text" className="auth-input" value={resetCode} onChange={e => setResetCode(e.target.value)} required />
                    </div>
                    <div className="form-group">
                      <label>New Password</label>
                      <input type="password" className="auth-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} required />
                    </div>
                  </>
                )}
                {error && <div className="error-text">{error}</div>}
                <button type="submit" className="btn-gradient">
                  {forgotStep === 1 ? 'SEND CODE' : 'RESET PASSWORD'}
                </button>
                <button type="button" className="btn-text-only" onClick={() => { setShowForgot(false); setForgotStep(1); setError(''); }}>Back to Login</button>
              </form>
            </>
          ) : (
            <>
              <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
              <p>{isLogin ? 'Log in to continue chatting.' : 'Sign up to meet strangers anonymously.'}</p>
              
              <form onSubmit={handleSubmit} className="auth-form">
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    className="auth-input"
                    value={email}
                    placeholder={isLogin ? 'you@example.com' : ''}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {!isLogin && (
                  <div className="form-group">
                    <label>Username</label>
                    <input
                      type="text"
                      className="auth-input"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                    />
                  </div>
                )}
                
                <div className="form-group">
                  <label>Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="auth-input"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? '👁️' : '👁️‍🗨️'}
                    </button>
                  </div>
                </div>

                {error && <div className="error-text">{error}</div>}

                <button type="submit" className="btn-gradient">
                  {isLogin ? 'LOG IN' : 'SIGN UP'}
                </button>
              </form>

              {isLogin && (
                <div className="forgot-password">
                  <button onClick={() => { setShowForgot(true); setError(''); }}>Forgot Password?</button>
                </div>
              )}

              <div className="auth-switch">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button onClick={() => { setIsLogin(!isLogin); setError(''); }}>
                  {isLogin ? 'Sign Up' : 'Log In'}
                </button>
              </div>

              <div className="auth-divider">
                <span>OR</span>
              </div>

              <div className="google-auth-wrapper">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError('Google login failed')}
                  theme="filled_black"
                  text={isLogin ? "signin_with" : "signup_with"}
                  shape="rectangular"
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const AuthPage = () => {
  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      <AuthContent />
    </GoogleOAuthProvider>
  );
};

export default AuthPage;
