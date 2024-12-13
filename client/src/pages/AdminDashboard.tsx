import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: number;
  email: string;
  name: string;
  gamesPlayed: number;
  gamesLimit: number;
  createdAt: string;
  isAdmin: boolean;
}

interface WordStatus {
  word: string;
  category: string;
  imageCount: number;
}

export default function AdminDashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [words, setWords] = useState<WordStatus[]>([]);
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'words' | 'logs'>('users');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const token = localStorage.getItem('authToken');
        const headers = {
          'Authorization': `Bearer ${token}`
        };

        // Fetch users
        const usersResponse = await fetch('/api/admin/users', { headers });
        if (usersResponse.status === 401) {
          setLocation('/auth');
          return;
        }

        if (!usersResponse.ok) {
          throw new Error('Failed to fetch users');
        }
        const usersData = await usersResponse.json();
        setUsers(usersData);

        // Fetch words status
        const wordsResponse = await fetch('/api/admin/words/status', { headers });
        if (!wordsResponse.ok) {
          throw new Error('Failed to fetch words status');
        }
        const wordsData = await wordsResponse.json();
        setWords(wordsData);

        // Fetch activity logs
        const logsResponse = await fetch('/api/admin/activity-logs', { headers });
        if (!logsResponse.ok) {
          throw new Error('Failed to fetch activity logs');
        }
        const logsData = await logsResponse.json();
        setActivityLogs(logsData);
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to fetch data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [setLocation]);

  const updateGamesLimit = async (userId: number, newLimit: number) => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`/api/admin/users/${userId}/games-limit`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ gamesLimit: newLimit })
      });

      if (!response.ok) {
        throw new Error('Failed to update games limit');
      }

      setUsers(users.map(user => 
        user.id === userId ? { ...user, gamesLimit: newLimit } : user
      ));

      toast({
        title: "Success",
        description: "Games limit updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update games limit",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  return (
    <div className="container mx-auto py-10">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <div className="space-x-2">
          <Button
            variant={activeTab === 'users' ? 'default' : 'outline'}
            onClick={() => setActiveTab('users')}
          >
            User Management
          </Button>
          <Button
            variant={activeTab === 'words' ? 'default' : 'outline'}
            onClick={() => setActiveTab('words')}
          >
            Word Management
          </Button>
          <Button
            variant={activeTab === 'logs' ? 'default' : 'outline'}
            onClick={() => setActiveTab('logs')}
          >
            Activity Logs
          </Button>
        </div>
      </div>

      {activeTab === 'users' && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Games Played</TableHead>
                <TableHead>Games Limit</TableHead>
                <TableHead>Is Admin</TableHead>
                <TableHead>Manage Game Limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.gamesPlayed}</TableCell>
                  <TableCell>{user.gamesLimit}</TableCell>
                  <TableCell>{user.isAdmin ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        defaultValue={user.gamesLimit}
                        className="w-20"
                        min={0}
                        onChange={(e) => {
                          const value = parseInt(e.target.value);
                          if (!isNaN(value) && value >= 0) {
                            updateGamesLimit(user.id, value);
                          }
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {activeTab === 'words' && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Word</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Images Available</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {words.map((word) => (
                <TableRow key={word.word}>
                  <TableCell>{word.word}</TableCell>
                  <TableCell>{word.category}</TableCell>
                  <TableCell>{word.imageCount}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const token = localStorage.getItem('authToken');
                          fetch(`/api/admin/words/${word.word}/generate`, {
                            method: 'POST',
                            headers: {
                              'Authorization': `Bearer ${token}`,
                              'Content-Type': 'application/json'
                            }
                          })
                          .then(response => {
                            if (!response.ok) throw new Error('Failed to generate images');
                            return response.json();
                          })
                          .then(() => {
                            toast({
                              title: "Success",
                              description: "Images generated successfully",
                            });
                            // Refresh word status
                            fetch('/api/admin/words/status', {
                              headers: { 'Authorization': `Bearer ${token}` }
                            })
                              .then(res => res.json())
                              .then(setWords);
                          })
                          .catch(error => {
                            toast({
                              title: "Error",
                              description: "Failed to generate images",
                              variant: "destructive",
                            });
                          });
                        }}
                      >
                        Generate Images
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Details</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activityLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{log.user?.name || 'Unknown'}</TableCell>
                  <TableCell>{log.actionType}</TableCell>
                  <TableCell>
                    {log.details ? JSON.stringify(log.details) : '-'}
                  </TableCell>
                  <TableCell>
                    {new Date(log.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
