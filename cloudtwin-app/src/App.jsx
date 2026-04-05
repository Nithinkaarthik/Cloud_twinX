import { useContext, useState } from "react";
import { AuthContext, AuthProvider } from "./context/AuthContext";
import CloudTwin from "./cloudtwin/cloudtwin";
import Login from "./pages/Login";
import Signup from "./pages/Signup";

function AppContent() {
  const { user, loading } = useContext(AuthContext);
  const [showSignup, setShowSignup] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 to-blue-950">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-500/20 mb-4">
            <div className="w-8 h-8 rounded-full border-2 border-blue-400 border-t-cyan-400 animate-spin"></div>
          </div>
          <p className="text-slate-400 text-sm">Loading CloudTwin...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return showSignup ? (
      <Signup onSwitchToLogin={() => setShowSignup(false)} />
    ) : (
      <Login onSwitchToSignup={() => setShowSignup(true)} />
    );
  }

  return <CloudTwin />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}