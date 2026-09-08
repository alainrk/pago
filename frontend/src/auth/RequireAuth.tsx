import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { PageLoading } from "../components/Spinner";
import { returnPath } from "../lib/returnPath";

export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <PageLoading />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: returnPath(location) }} />;
  }
  return <Outlet />;
}

// PublicOnly sends signed-in users away from the login page.
export function PublicOnly() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}
