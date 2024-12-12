import { Switch, Route } from "wouter";
import Home from "./pages/Home";
import Room from "./pages/Room";
import Auth from "./pages/Auth";
import AdminDashboard from "./pages/AdminDashboard";

function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/room/:code" component={Room} />
      <Route path="/auth" component={Auth} />
      <Route path="/admin" component={AdminDashboard} />
      <Route>404 - Page Not Found</Route>
    </Switch>
  );
}

export default App;
