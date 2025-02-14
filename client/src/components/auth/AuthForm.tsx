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
    try {
      console.log('Starting authentication process...', new Date().toISOString());
      
      if (!values.email || !values.password) {
        console.log('Missing required fields');
        toast({
          title: "Error",
          description: "Please fill in all required fields",
          variant: "destructive",
        });
        return;
      }

      console.log('Validation passed, proceeding with authentication');
      
      console.log('All required fields present, proceeding with authentication');

      setLoading(true);

      // Clear any existing auth token
      localStorage.removeItem('authToken');

      console.log('Sending authentication request...');
      const response = await fetch(`/api/auth/${isLogin ? 'login' : 'signup'}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          ...(isLogin ? {} : { name: values.name }),
        }),
      });
      
      console.log('Response received:', {
        status: response.status,
        statusText: response.statusText,
      });

      let data;
      try {
        data = await response.json();
        console.log('Response data received:', { ...data, token: data.token ? '[PRESENT]' : '[MISSING]' });
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        throw new Error('Server response was not in the expected format');
      }

      if (!response.ok) {
        console.error('Server returned error:', data);
        throw new Error(data.message || `Failed to ${isLogin ? 'log in' : 'sign up'}`);
      }

      if (!data.token) {
        throw new Error("No authentication token received");
      }

      // Save the token and show success message
      localStorage.setItem('authToken', data.token);
      
      toast({
        title: "Success",
        description: isLogin ? "Successfully logged in!" : "Account created successfully!",
      });

      // Redirect based on user role
      if (data.user?.isAdmin) {
        setLocation("/admin");
      } else {
        setLocation("/");
      }
    } catch (error: any) {
      console.error("Auth error:", error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${isLogin ? 'log in' : 'sign up'}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
              console.log('Form submit event captured');
              const formData = form.getValues();
              console.log('Form data:', { ...formData, password: '***' });
              onSubmit(formData);
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
