import { Route, Routes, useLocation } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { GlobalCanvas } from "@/components/3d/GlobalCanvas";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import ResumeUpload from "@/pages/ResumeUpload";
import StartInterview from "@/pages/StartInterview";
import Interview from "@/pages/Interview";
import Report from "@/pages/Report";
import ViolationSummary from "@/pages/ViolationSummary";

export default function App() {
  const location = useLocation();
  const isInterview = location.pathname.startsWith("/interview");

  return (
    <div className="min-h-screen">
      {/* The GlobalCanvas provides the WebGL context for all <View> components across pages */}
      <GlobalCanvas />
      
      {!isInterview && <Navbar />}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/resume" element={<ResumeUpload />} />
          <Route path="/start" element={<StartInterview />} />
          <Route path="/interview/:sessionId" element={<Interview />} />
          <Route path="/interview/:sessionId/terminated" element={<ViolationSummary />} />
          <Route path="/report/:sessionId" element={<Report />} />
        </Route>
      </Routes>
    </div>
  );
}
