export async function POST(request: Request) {
  try {
    const { name, email } = await request.json();

    if (!name || !email) {
      return Response.json({ error: 'Missing fields' }, { status: 400 });
    }

    const mailtoLink = `mailto:support@profaceapp.com?subject=Contact from ${encodeURIComponent(name)}&body=Name: ${encodeURIComponent(name)}%0AEmail: ${encodeURIComponent(email)}`;

    return Response.json({
      success: true,
      message: `Contact received from ${name} (${email})`,
      supportEmail: 'support@profaceapp.com'
    });
  } catch (error) {
    return Response.json({ error: 'Failed to process contact' }, { status: 500 });
  }
}
