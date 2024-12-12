import { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const authSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
});

type AuthFormValues = z.infer<typeof authSchema>;

export default function AuthForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    defaultValues: {
      email: "",
      password: "",
      name: "",
    },
  });

  async function onSubmit(values: AuthFormValues) {
    console.log("Starting form submission with values:", { ...values, password: '***' });
    
    if (!values.email || !values.password) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const endpoint = `/api/auth/${isLogin ? 'login' : 'signup'}`;
      console.log(`Submitting to endpoint: ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(isLogin ? {
          email: values.email,
          password: values.password
        } : values),
      });

      console.log("Response status:", response.status);
      
      let result;
      try {
        result = await response.json();
        console.log("Response parsed successfully:", { ...result, token: '***' });
      } catch (parseError) {
        console.error("Failed to parse response:", parseError);
        throw new Error("Server response was not in the expected format");
      }
      
      if (!response.ok) {
        console.error("Server returned error:", result);
        throw new Error(result.message || `Failed to ${isLogin ? 'log in' : 'sign up'}`);
      }

      if (!result.token) {
        console.error("No token in response:", result);
        throw new Error("Invalid server response: no authentication token");
      }

      console.log("Authentication successful, saving token");
      localStorage.setItem('authToken', result.token);
      
      toast({
        title: "Success",
        description: isLogin ? "Successfully logged in!" : "Account created successfully!",
      });
      
      console.log("Checking user role:", result.user);
      if (result.user?.isAdmin) {
        console.log("Redirecting to admin dashboard");
        setLocation("/admin");
      } else {
        console.log("Redirecting to home");
        setLocation("/");
      }
    } catch (error: any) {
      console.error("Authentication error:", error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${isLogin ? 'log in' : 'sign up'}`,
        variant: "destructive",
      });
      setLoading(false);
    } finally {
      if (loading) {
        setLoading(false);
      }
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">
          {isLogin ? "Welcome Back" : "Create Account"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              form.handleSubmit(onSubmit)(e);
            }} 
            className="space-y-4"
          >
            {!isLogin && (
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter your name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="Enter your email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="Enter your password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button 
              type="submit" 
              className="w-full" 
              disabled={loading}
            >
              {loading ? "Please wait..." : (isLogin ? "Log In" : "Sign Up")}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex flex-col items-center">
        <Button
          variant="link"
          onClick={() => setIsLogin(!isLogin)}
          className="text-sm"
          disabled={loading}
        >
          {isLogin ? "Need an account? Sign up" : "Already have an account? Log in"}
        </Button>
      </CardFooter>
    </Card>
  );
}
