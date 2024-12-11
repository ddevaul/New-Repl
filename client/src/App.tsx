import { Switch, Route } from "wouter";
import Home from "./pages/Home";
import Room from "./pages/Room";

function App() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/room/:code" component={Room} />
      <Route>404 - Page Not Found</Route>
    </Switch>
  );
}

export default App;
